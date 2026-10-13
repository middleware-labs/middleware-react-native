import type { Attributes, Span } from '@opentelemetry/api';
import type { FetchError } from '@opentelemetry/instrumentation-fetch/build/src/types';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import shimmer from '@opentelemetry/instrumentation/build/src/shimmer';
import { captureTraceParent } from './serverTiming';
import { headerCapture, jsonToString } from './utils';

/** Longest `http.response.body` recorded, in UTF-16 code units (64 KiB). */
export const MAX_RESPONSE_BODY_LENGTH = 65536;

export interface NetworkCaptureOptions {
  /** Record request and response headers (and Server-Timing trace links). */
  captureNetworkHeaders: boolean;
  /** Record JSON and plain-text response bodies. */
  captureResponseBodies: boolean;
  /** Lowercase header names that are never recorded. */
  ignoreHeaders: Set<string>;
}

/** Lowercases `ignoreHeaders` so the user can list them in any case. */
export function normalizeIgnoreHeaders(
  ignoreHeaders: Iterable<string> | undefined
): Set<string> {
  const normalized = new Set<string>();
  if (!ignoreHeaders) {
    return normalized;
  }
  for (const header of ignoreHeaders) {
    if (typeof header === 'string') {
      normalized.add(header.toLowerCase());
    }
  }
  return normalized;
}

export function resolveNetworkCaptureOptions(config: {
  captureNetworkHeaders?: boolean;
  captureResponseBodies?: boolean;
  ignoreHeaders?: Iterable<string>;
}): NetworkCaptureOptions {
  return {
    captureNetworkHeaders: config.captureNetworkHeaders === true,
    captureResponseBodies: config.captureResponseBodies === true,
    ignoreHeaders: normalizeIgnoreHeaders(config.ignoreHeaders),
  };
}

function normalizeContentType(type: string | null | undefined): string {
  if (!type) {
    return '';
  }
  const [baseType = ''] = type.split(';', 1);
  return baseType.trim().toLowerCase();
}

/** application/json, plus structured-syntax types like application/problem+json. */
export function isJsonContentType(type: string | null | undefined): boolean {
  const normalized = normalizeContentType(type);
  return normalized === 'application/json' || normalized.endsWith('+json');
}

/** Response bodies `captureResponseBodies` records: JSON and plain text. */
export function isCapturedBodyType(type: string | null | undefined): boolean {
  return isJsonContentType(type) || normalizeContentType(type) === 'text/plain';
}

function setResponseBody(span: Span, body: unknown): void {
  if (typeof body !== 'string' || body.length === 0) {
    return;
  }
  span.setAttribute(
    'http.response.body',
    body.length > MAX_RESPONSE_BODY_LENGTH
      ? body.slice(0, MAX_RESPONSE_BODY_LENGTH)
      : body
  );
}

/** Parses `getAllResponseHeaders()` into a map keyed by lowercase header name. */
function parseResponseHeaders(raw: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!raw) {
    return headers;
  }
  for (const line of raw.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator <= 0) {
      continue;
    }
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name && value) {
      headers[name] = value;
    }
  }
  return headers;
}

// Request headers set on each in-flight XHR, keyed by lowercase name. XHR has
// no getter for request headers, and otel only calls
// `applyCustomAttributesOnSpan` once the request has finished, so they are
// collected from `setRequestHeader` as they are set.
const xhrRequestHeaders = new WeakMap<object, Record<string, string>>();
// XHRs whose own `setRequestHeader` we wrapped, so unwrap never touches a
// wrapper someone else installed (e.g. on the prototype).
const wrappedXhrs = new WeakSet<object>();

function trackRequestHeaders(xhr: XMLHttpRequest): void {
  xhrRequestHeaders.set(xhr, {});
  if (wrappedXhrs.has(xhr)) {
    return;
  }
  wrappedXhrs.add(xhr);
  shimmer.wrap(xhr, 'setRequestHeader', (original) => {
    return function (this: XMLHttpRequest, header: string, value: string) {
      const headers = xhrRequestHeaders.get(this);
      if (headers && typeof header === 'string') {
        const name = header.toLowerCase();
        // XHR combines repeated headers the same way.
        headers[name] =
          headers[name] !== undefined ? `${headers[name]}, ${value}` : value;
      }
      return original.call(this, header, value);
    };
  });
}

function takeRequestHeaders(
  xhr: XMLHttpRequest
): Record<string, string> | undefined {
  const headers = xhrRequestHeaders.get(xhr);
  xhrRequestHeaders.delete(xhr);
  if (wrappedXhrs.has(xhr)) {
    wrappedXhrs.delete(xhr);
    shimmer.unwrap(xhr, 'setRequestHeader');
  }
  return headers;
}

type MiddlewareXhrConfig = ConstructorParameters<
  typeof XMLHttpRequestInstrumentation
>[0] & { captureNetworkHeaders?: boolean };

/**
 * Starts collecting request headers when `open` is called (the point otel
 * creates the span), but only with `captureNetworkHeaders` on.
 */
export class MiddlewareXHRInstrumentation extends XMLHttpRequestInstrumentation {
  constructor(config: MiddlewareXhrConfig = {}) {
    super(config);
  }

  protected _patchOpen() {
    const patchOpen = super._patchOpen();
    const captureHeaders = () =>
      (this.getConfig() as MiddlewareXhrConfig).captureNetworkHeaders === true;
    return (original: any) => {
      const patched = patchOpen(original);
      return function (this: XMLHttpRequest, ...args: any[]) {
        if (captureHeaders()) {
          trackRequestHeaders(this);
        }
        return (patched as any).apply(this, args);
      } as any;
    };
  }
}

/**
 * `applyCustomAttributesOnSpan` for XHR. Otel runs it once the request has
 * finished (from the load/error/abort/timeout handler), so the response is
 * complete and readable here.
 */
export function createXhrAttributeHook(options: NetworkCaptureOptions) {
  return (span: Span, xhr: XMLHttpRequest): void => {
    if (!span) {
      return;
    }
    const httpURL = (span as unknown as { attributes: Attributes })
      ?.attributes?.['url.full'];
    if (httpURL) {
      span.updateName(
        `${(span as unknown as { name: string }).name} ${httpURL}`
      );
    }
    span.setAttribute('event.type', 'xhr');

    // Always drained, so a request whose capture setting changed mid-flight
    // never leaves its wrapper behind.
    const requestHeaders = takeRequestHeaders(xhr);

    if (options.captureNetworkHeaders) {
      if (requestHeaders) {
        headerCapture(
          'request',
          Object.keys(requestHeaders),
          options.ignoreHeaders
        )(span, (header) => requestHeaders[header as string]);
      }
      let responseHeaders: Record<string, string> = {};
      try {
        responseHeaders = parseResponseHeaders(xhr.getAllResponseHeaders());
      } catch (e) {
        // ignore
      }
      headerCapture(
        'response',
        Object.keys(responseHeaders),
        options.ignoreHeaders
      )(span, (header) => responseHeaders[header as string]);
      const serverTiming = responseHeaders['server-timing'];
      if (serverTiming) {
        captureTraceParent(serverTiming, span);
      }
    }

    if (options.captureResponseBodies) {
      try {
        if (isCapturedBodyType(xhr.getResponseHeader('Content-Type'))) {
          setResponseBody(
            span,
            xhr.responseType === 'json'
              ? jsonToString(xhr.response)
              : xhr.responseText
          );
        }
      } catch (e) {
        // ignore (responseText throws unless responseType is "" or "text")
      }
    }
  };
}

type HeaderSource = {
  forEach?: (callback: (value: string, name: string) => void) => void;
};

/** Reads `Headers`, a `[name, value][]` list or a plain object into lowercase keys. */
function collectHeaders(headers: unknown): Record<string, string> {
  const collected: Record<string, string> = {};
  if (!headers || typeof headers !== 'object') {
    return collected;
  }
  const add = (name: unknown, value: unknown) => {
    if (typeof name === 'string' && value !== undefined && value !== null) {
      collected[name.toLowerCase()] = String(value);
    }
  };
  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (Array.isArray(entry)) {
        add(entry[0], entry[1]);
      }
    }
  } else if (typeof (headers as HeaderSource).forEach === 'function') {
    (headers as HeaderSource).forEach!((value, name) => add(name, value));
  } else {
    for (const [name, value] of Object.entries(headers)) {
      add(name, value);
    }
  }
  return collected;
}

type FetchResult = {
  headers?: { get?: (name: string) => string | null } & HeaderSource;
  clone?: () => { text: () => Promise<string> };
};

/**
 * `applyCustomAttributesOnSpan` for fetch. Otel ends the span a short while
 * after calling it, which leaves time for the cloned body to be read.
 */
export function createFetchAttributeHook(options: NetworkCaptureOptions) {
  return (
    s: Span | { span: Span; attributes: Attributes; name: string },
    request: Request | RequestInit,
    result: Response | FetchError
  ): void => {
    const span = s as Span;
    const httpURL = (s as { span: Span; attributes: Attributes; name: string })
      .attributes?.['url.full'];
    if (httpURL) {
      span.updateName(
        `${
          (s as { span: Span; attributes: Attributes; name: string }).name
        } ${httpURL}`
      );
    }
    span.setAttribute('event.type', 'fetch');

    const response = result as unknown as FetchResult;
    const responseHeaders =
      response && typeof response.headers?.get === 'function'
        ? response.headers
        : undefined;

    if (options.captureNetworkHeaders) {
      const requestHeaders = collectHeaders(
        (request as RequestInit | undefined)?.headers
      );
      headerCapture(
        'request',
        Object.keys(requestHeaders),
        options.ignoreHeaders
      )(span, (header) => requestHeaders[header as string]);
      if (responseHeaders) {
        const headers = collectHeaders(responseHeaders);
        headerCapture(
          'response',
          Object.keys(headers),
          options.ignoreHeaders
        )(span, (header) => headers[header as string]);
      }
    }

    if (
      options.captureResponseBodies &&
      responseHeaders &&
      typeof response.clone === 'function'
    ) {
      try {
        if (isCapturedBodyType(responseHeaders.get!('Content-Type'))) {
          response
            .clone()
            .text()
            .then((body) => setResponseBody(span, body))
            .catch(() => {
              // ignore
            });
        }
      } catch (e) {
        // ignore (body already used)
      }
    }
  };
}
