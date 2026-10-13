/**
 * Header/body capture on network spans is opt-in. These drive the real otel XHR
 * instrumentation against a fake XMLHttpRequest, so they also cover when otel
 * calls `applyCustomAttributesOnSpan` (after the request has finished).
 */
import { context, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { StackContextManager } from '@opentelemetry/sdk-trace-web';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import {
  createFetchAttributeHook,
  createXhrAttributeHook,
  isCapturedBodyType,
  MAX_RESPONSE_BODY_LENGTH,
  MiddlewareXHRInstrumentation,
  resolveNetworkCaptureOptions,
} from '../networkCapture';

type Listener = (this: FakeXHR) => void;

class FakeXHR {
  static UNSENT = 0;
  static OPENED = 1;
  static HEADERS_RECEIVED = 2;
  static LOADING = 3;
  static DONE = 4;
  UNSENT = 0;
  OPENED = 1;
  HEADERS_RECEIVED = 2;
  LOADING = 3;
  DONE = 4;

  readyState = 0;
  status = 0;
  statusText = '';
  responseType = '';
  response: any = null;
  sentHeaders: Record<string, string> = {};
  sentBody: any;
  private listeners: Record<string, Listener[]> = {};
  private responseHeaders: Record<string, string> = {};
  private body = '';

  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }
  removeEventListener(type: string, listener: Listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter(
      (l) => l !== listener
    );
  }
  private dispatch(type: string) {
    for (const listener of [...(this.listeners[type] ?? [])]) {
      listener.call(this);
    }
  }
  open(_method: string, _url: string) {
    this.readyState = this.OPENED;
    this.dispatch('readystatechange');
  }
  setRequestHeader(name: string, value: string) {
    this.sentHeaders[name] = value;
  }
  send(body?: any) {
    this.sentBody = body;
  }
  getAllResponseHeaders() {
    return Object.entries(this.responseHeaders)
      .map(([name, value]) => `${name}: ${value}`)
      .join('\r\n');
  }
  getResponseHeader(name: string) {
    const match = Object.keys(this.responseHeaders).find(
      (h) => h.toLowerCase() === name.toLowerCase()
    );
    return match === undefined ? null : this.responseHeaders[match]!;
  }
  get responseText() {
    if (this.responseType !== '' && this.responseType !== 'text') {
      throw new Error('InvalidStateError');
    }
    return this.body;
  }
  respond(status: number, headers: Record<string, string>, body = '') {
    this.status = status;
    this.statusText = 'OK';
    this.responseHeaders = headers;
    this.readyState = this.HEADERS_RECEIVED;
    this.dispatch('readystatechange');
    this.body = body;
    if (this.responseType === 'json') {
      this.response = body ? JSON.parse(body) : null;
    }
    this.readyState = this.DONE;
    this.dispatch('readystatechange');
    this.dispatch('load');
    this.dispatch('loadend');
  }
}

const URL_ = 'https://api.example.com/login';
const originalXHR = (global as any).XMLHttpRequest;
let instrumentation: MiddlewareXHRInstrumentation | undefined;

beforeAll(() => {
  (global as any).XMLHttpRequest = FakeXHR;
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  context.setGlobalContextManager(new StackContextManager().enable());
  trace.setGlobalTracerProvider(new BasicTracerProvider());
});

afterAll(() => {
  (global as any).XMLHttpRequest = originalXHR;
  propagation.disable();
  context.disable();
  trace.disable();
});

afterEach(() => {
  instrumentation?.disable();
  instrumentation = undefined;
});

type Attrs = Record<string, unknown>;

/** Runs one request through the instrumentation; returns the span attributes and name. */
function runXhr(
  config: Parameters<typeof resolveNetworkCaptureOptions>[0],
  {
    responseHeaders = {},
    body = '',
    responseType = '',
  }: {
    responseHeaders?: Record<string, string>;
    body?: string;
    responseType?: string;
  } = {}
) {
  const options = resolveNetworkCaptureOptions(config);
  const hook = createXhrAttributeHook(options);
  const spans: any[] = [];
  const readyStates: number[] = [];
  instrumentation = new MiddlewareXHRInstrumentation({
    semconvStabilityOptIn: 'http',
    propagateTraceHeaderCorsUrls: [/.*/],
    captureNetworkHeaders: options.captureNetworkHeaders,
    applyCustomAttributesOnSpan: (span: any, xhr: any) => {
      readyStates.push(xhr.readyState);
      hook(span, xhr);
      spans.push(span);
    },
  } as any);

  const xhr = new (global as any).XMLHttpRequest() as FakeXHR;
  xhr.responseType = responseType;
  xhr.open('POST', URL_);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Authorization', 'Bearer secret');
  xhr.setRequestHeader('X-Access-Token', 'tok');
  xhr.send(JSON.stringify({ username: 'u', password: 'hunter2' }));
  xhr.respond(200, responseHeaders, body);

  expect(spans).toHaveLength(1);
  const span = spans[0];
  return {
    attrs: span.attributes as Attrs,
    name: span.name as string,
    xhr,
    readyStates,
  };
}

const capturedKeys = (attrs: Attrs) =>
  Object.keys(attrs).filter(
    (k) =>
      k.startsWith('http.request.header.') ||
      k.startsWith('http.response.header.') ||
      k === 'http.request.body' ||
      k === 'http.response.body' ||
      k.startsWith('link.')
  );

const JSON_RESPONSE = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Request-Id': 'abc',
  'Server-Timing':
    'traceparent;desc="00-0123456789abcdef0123456789abcdef-0123456789abcdef-01"',
};

describe('XHR capture', () => {
  it('runs the attribute hook only once the request is DONE', () => {
    // So readystatechange listeners added from the hook would never fire.
    const { readyStates } = runXhr({}, { responseHeaders: JSON_RESPONSE });
    expect(readyStates).toEqual([FakeXHR.DONE]);
  });

  it('captures no headers or bodies by default', () => {
    const { attrs, name, xhr } = runXhr(
      {},
      { responseHeaders: JSON_RESPONSE, body: '{"token":"t"}' }
    );
    expect(capturedKeys(attrs)).toEqual([]);
    expect(attrs['event.type']).toBe('xhr');
    expect(name).toBe(`POST ${URL_}`);
    // The request still goes out untouched.
    expect(xhr.sentHeaders.Authorization).toBe('Bearer secret');
    expect(xhr.sentHeaders.traceparent).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(xhr, 'setRequestHeader')).toBe(
      false
    );
  });

  it('captures request and response headers only with captureNetworkHeaders', () => {
    const { attrs, xhr } = runXhr(
      { captureNetworkHeaders: true },
      { responseHeaders: JSON_RESPONSE, body: '{"token":"t"}' }
    );
    expect(attrs['http.request.header.content_type']).toBe('application/json');
    expect(attrs['http.request.header.authorization']).toBe('Bearer secret');
    expect(attrs['http.request.header.x_access_token']).toBe('********');
    expect(attrs['http.request.header.traceparent']).toBeDefined();
    expect(attrs['http.response.header.x_request_id']).toBe('abc');
    expect(attrs['http.response.header.content_type']).toBe(
      'application/json; charset=utf-8'
    );
    expect(attrs['link.traceId']).toBe('0123456789abcdef0123456789abcdef');
    expect(attrs['link.spanId']).toBe('0123456789abcdef');
    expect(attrs['http.response.body']).toBeUndefined();
    expect(attrs['http.request.body']).toBeUndefined();
    expect(xhr.sentHeaders['X-Access-Token']).toBe('tok');
    // The per-request setRequestHeader wrapper is removed again.
    expect((xhr.setRequestHeader as any).__wrapped).toBeUndefined();
  });

  it('skips the Server-Timing link without captureNetworkHeaders', () => {
    const { attrs } = runXhr(
      { captureResponseBodies: true },
      { responseHeaders: JSON_RESPONSE, body: '{}' }
    );
    expect(attrs['link.traceId']).toBeUndefined();
  });

  it('captures response bodies only with captureResponseBodies', () => {
    const { attrs } = runXhr(
      { captureResponseBodies: true },
      { responseHeaders: JSON_RESPONSE, body: '{"token":"t"}' }
    );
    expect(attrs['http.response.body']).toBe('{"token":"t"}');
    expect(
      capturedKeys(attrs).filter((k) => k !== 'http.response.body')
    ).toEqual([]);
  });

  it.each([
    ['application/json', true],
    ['application/problem+json; charset=utf-8', true],
    ['application/vnd.api+json', true],
    ['text/plain;charset=UTF-8', true],
    ['TEXT/PLAIN', true],
    ['text/html; charset=utf-8', false],
    ['application/xml', false],
    ['application/octet-stream', false],
  ])('content type %s captured: %s', (contentType, captured) => {
    const { attrs } = runXhr(
      { captureResponseBodies: true },
      { responseHeaders: { 'Content-Type': contentType }, body: 'payload' }
    );
    expect(attrs['http.response.body']).toBe(captured ? 'payload' : undefined);
  });

  it('skips bodies without a Content-Type', () => {
    const { attrs } = runXhr({ captureResponseBodies: true }, { body: 'x' });
    expect(attrs['http.response.body']).toBeUndefined();
  });

  it('stringifies responseType "json" responses', () => {
    const { attrs } = runXhr(
      { captureResponseBodies: true },
      {
        responseHeaders: { 'Content-Type': 'application/json' },
        body: '{ "a" : [1, 2] }',
        responseType: 'json',
      }
    );
    expect(attrs['http.response.body']).toBe('{"a":[1,2]}');
  });

  it('ignores bodies it cannot read as text', () => {
    const { attrs } = runXhr(
      { captureResponseBodies: true },
      {
        responseHeaders: { 'Content-Type': 'text/plain' },
        body: 'x',
        responseType: 'blob',
      }
    );
    expect(attrs['http.response.body']).toBeUndefined();
  });

  it('truncates response bodies to 64 KiB', () => {
    const body = 'a'.repeat(MAX_RESPONSE_BODY_LENGTH + 10);
    const { attrs } = runXhr(
      { captureResponseBodies: true },
      { responseHeaders: { 'Content-Type': 'text/plain' }, body }
    );
    expect(attrs['http.response.body']).toHaveLength(65536);
  });

  it('never captures request bodies', () => {
    const { attrs } = runXhr(
      { captureNetworkHeaders: true, captureResponseBodies: true },
      { responseHeaders: JSON_RESPONSE, body: '{}' }
    );
    expect(attrs['http.request.body']).toBeUndefined();
    expect(JSON.stringify(attrs)).not.toContain('hunter2');
  });

  it('drops ignoreHeaders case-insensitively', () => {
    const { attrs } = runXhr(
      {
        captureNetworkHeaders: true,
        ignoreHeaders: new Set(['AUTHORIZATION', 'x-request-id']),
      },
      { responseHeaders: JSON_RESPONSE }
    );
    expect(attrs['http.request.header.authorization']).toBeUndefined();
    expect(attrs['http.response.header.x_request_id']).toBeUndefined();
    expect(attrs['http.request.header.content_type']).toBe('application/json');
  });

  it('accepts ignoreHeaders as an array', () => {
    const { attrs } = runXhr(
      { captureNetworkHeaders: true, ignoreHeaders: ['Content-Type'] },
      { responseHeaders: JSON_RESPONSE }
    );
    expect(attrs['http.request.header.content_type']).toBeUndefined();
    expect(attrs['http.response.header.content_type']).toBeUndefined();
    expect(attrs['http.request.header.authorization']).toBe('Bearer secret');
  });
});

describe('fetch capture', () => {
  const fakeSpan = (attributes: Attrs = { 'url.full': URL_ }) => {
    const span: any = {
      name: 'POST',
      attributes,
      setAttribute(key: string, value: unknown) {
        this.attributes[key] = value;
      },
      updateName(name: string) {
        this.name = name;
      },
    };
    return span;
  };

  const response = (headers: Record<string, string>, body: string) => {
    const h = new Map(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    );
    const headerObj = {
      get: (name: string) => h.get(name.toLowerCase()) ?? null,
      forEach: (cb: (value: string, name: string) => void) =>
        h.forEach((v, k) => cb(v, k)),
    };
    return {
      headers: headerObj,
      clone: () => ({ text: () => Promise.resolve(body) }),
    } as any;
  };

  const request = {
    method: 'POST',
    headers: { 'Authorization': 'Bearer secret', 'X-Access-Token': 'tok' },
    body: '{"password":"hunter2"}',
  };

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('captures nothing by default', async () => {
    const span = fakeSpan();
    createFetchAttributeHook(resolveNetworkCaptureOptions({}))(
      span,
      request,
      response({ 'Content-Type': 'application/json' }, '{"a":1}')
    );
    await flush();
    expect(capturedKeys(span.attributes)).toEqual([]);
    expect(span.attributes['event.type']).toBe('fetch');
    expect(span.name).toBe(`POST ${URL_}`);
  });

  it('captures headers only with captureNetworkHeaders', async () => {
    const span = fakeSpan();
    createFetchAttributeHook(
      resolveNetworkCaptureOptions({
        captureNetworkHeaders: true,
        ignoreHeaders: ['x-request-id'],
      })
    )(
      span,
      request,
      response(
        { 'Content-Type': 'application/json', 'X-Request-Id': 'abc' },
        '{"a":1}'
      )
    );
    await flush();
    expect(span.attributes['http.request.header.authorization']).toBe(
      'Bearer secret'
    );
    expect(span.attributes['http.request.header.x_access_token']).toBe(
      '********'
    );
    expect(span.attributes['http.response.header.content_type']).toBe(
      'application/json'
    );
    expect(
      span.attributes['http.response.header.x_request_id']
    ).toBeUndefined();
    expect(span.attributes['http.response.body']).toBeUndefined();
    expect(span.attributes['http.request.body']).toBeUndefined();
  });

  it('captures JSON/text bodies only with captureResponseBodies', async () => {
    const hook = createFetchAttributeHook(
      resolveNetworkCaptureOptions({ captureResponseBodies: true })
    );
    const json = fakeSpan();
    hook(json, request, response({ 'Content-Type': 'text/plain' }, 'hello'));
    const html = fakeSpan();
    hook(html, request, response({ 'Content-Type': 'text/html' }, '<p>'));
    await flush();
    expect(json.attributes['http.response.body']).toBe('hello');
    expect(capturedKeys(json.attributes)).toEqual(['http.response.body']);
    expect(html.attributes['http.response.body']).toBeUndefined();
  });

  it('handles fetch errors without a response', () => {
    const span = fakeSpan();
    createFetchAttributeHook(
      resolveNetworkCaptureOptions({
        captureNetworkHeaders: true,
        captureResponseBodies: true,
      })
    )(span, request, { message: 'Network request failed' } as any);
    expect(span.attributes['http.request.header.authorization']).toBe(
      'Bearer secret'
    );
    expect(span.attributes['http.response.body']).toBeUndefined();
  });
});

describe('isCapturedBodyType', () => {
  it('matches JSON, +json and text/plain base types only', () => {
    expect(isCapturedBodyType('application/json')).toBe(true);
    expect(isCapturedBodyType(' Application/JSON ; charset=utf-8')).toBe(true);
    expect(isCapturedBodyType('application/ld+json')).toBe(true);
    expect(isCapturedBodyType('text/plain')).toBe(true);
    expect(isCapturedBodyType('text/html')).toBe(false);
    expect(isCapturedBodyType('text/x-component')).toBe(false);
    expect(isCapturedBodyType('application/jsonp')).toBe(false);
    expect(isCapturedBodyType(null)).toBe(false);
    expect(isCapturedBodyType('')).toBe(false);
  });
});
