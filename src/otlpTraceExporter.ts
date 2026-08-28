import { diag, type HrTime, type SpanKind } from '@opentelemetry/api';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

/**
 * Minimal OTLP/HTTP + JSON trace exporter.
 *
 * The native SDKs own the OTLP pipeline on a normal build, so this is only
 * used when the native module isn't in the binary — Expo Go, a JS-only
 * reload before a rebuild, or a project where autolinking missed the package.
 * Without it the SDK produces spans that go nowhere and reports success,
 * which is indistinguishable from "RUM isn't installed".
 *
 * Wire contract matches the other Middleware RUM SDKs: POST to
 * `{target}/v1/traces` with the account key in `Authorization`.
 */
export interface OtlpExporterOptions {
  /** Base ingest URL, e.g. `https://myproject.middleware.io`. */
  target: string;
  /** Middleware account key, sent verbatim as `Authorization`. */
  accountKey: string;
}

type AnyValue = Record<string, unknown>;
type KeyValue = { key: string; value: AnyValue };

/**
 * Epoch nanoseconds as a decimal string. `hrTimeToNanoseconds` returns a
 * `number`, and epoch nanos (~1.7e18) are well past `Number.MAX_SAFE_INTEGER`,
 * so going through a float silently corrupts timestamps.
 */
function hrTimeToNanoString(time: HrTime): string {
  return `${time[0]}${String(time[1]).padStart(9, '0')}`;
}

function toAnyValue(value: unknown): AnyValue {
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'boolean') {
    return { boolValue: value };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toAnyValue) } };
  }
  if (value === null || value === undefined) {
    return { stringValue: '' };
  }
  return { stringValue: String(value) };
}

function toKeyValues(attributes: Record<string, unknown> = {}): KeyValue[] {
  return Object.keys(attributes).map((key) => ({
    key,
    value: toAnyValue(attributes[key]),
  }));
}

/**
 * OTel JS `SpanKind` is 0-based (INTERNAL = 0) while the OTLP proto enum
 * reserves 0 for UNSPECIFIED, so every kind shifts by one.
 */
function toOtlpKind(kind: SpanKind): number {
  return (kind as number) + 1;
}

function toOtlpSpan(span: ReadableSpan) {
  const ctx = span.spanContext();
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: span.parentSpanId ?? undefined,
    name: span.name,
    kind: toOtlpKind(span.kind),
    startTimeUnixNano: hrTimeToNanoString(span.startTime),
    endTimeUnixNano: hrTimeToNanoString(span.endTime),
    attributes: toKeyValues(span.attributes as Record<string, unknown>),
    droppedAttributesCount: span.droppedAttributesCount,
    events: span.events.map((event) => ({
      name: event.name,
      timeUnixNano: hrTimeToNanoString(event.time),
      attributes: toKeyValues(event.attributes as Record<string, unknown>),
      droppedAttributesCount: event.droppedAttributesCount ?? 0,
    })),
    droppedEventsCount: span.droppedEventsCount,
    links: span.links.map((link) => ({
      traceId: link.context.traceId,
      spanId: link.context.spanId,
      attributes: toKeyValues(link.attributes as Record<string, unknown>),
    })),
    droppedLinksCount: span.droppedLinksCount,
    status: { code: span.status.code, message: span.status.message },
  };
}

/** Groups spans by instrumentation scope, as OTLP's scopeSpans requires. */
function toResourceSpans(spans: ReadableSpan[]) {
  const byScope = new Map<string, ReadableSpan[]>();
  spans.forEach((span) => {
    const lib = span.instrumentationLibrary;
    const key = `${lib.name}@${lib.version ?? ''}`;
    const bucket = byScope.get(key);
    if (bucket) {
      bucket.push(span);
    } else {
      byScope.set(key, [span]);
    }
  });

  // Resource is identical across a batch (one provider), so read it off the
  // first span. Its getters (session.id, recording, ...) resolve on access.
  const resourceAttributes = spans[0]
    ? toKeyValues(spans[0].resource.attributes as Record<string, unknown>)
    : [];

  return [
    {
      resource: { attributes: resourceAttributes },
      scopeSpans: Array.from(byScope.values()).map((scopeSpans) => ({
        scope: {
          name: scopeSpans[0]!.instrumentationLibrary.name,
          version: scopeSpans[0]!.instrumentationLibrary.version ?? undefined,
        },
        spans: scopeSpans.map(toOtlpSpan),
      })),
    },
  ];
}

export default class OtlpHttpTraceExporter implements SpanExporter {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private shutdownOnce = false;

  constructor(options: OtlpExporterOptions) {
    this.url = `${options.target.replace(/\/+$/, '')}/v1/traces`;
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': options.accountKey,
      'Origin': 'sdk.middleware.io',
    };
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    if (this.shutdownOnce || spans.length === 0) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    const body = JSON.stringify({ resourceSpans: toResourceSpans(spans) });

    // `fetch` here is the app's global fetch. The instrumentations ignore
    // `{target}/v1/traces` (DEFAULT_IGNORE_URLS), so this cannot self-trace.
    fetch(this.url, { method: 'POST', headers: this.headers, body })
      .then((response) => {
        if (response.ok) {
          diag.debug(
            `[MiddlewareRum] OTLP export ok: ${spans.length} span(s) -> ${this.url}`
          );
          resultCallback({ code: ExportResultCode.SUCCESS });
        } else {
          const err = new Error(
            `OTLP export failed: ${response.status} ${response.statusText}`
          );
          diag.error(`[MiddlewareRum] ${err.message}`);
          resultCallback({ code: ExportResultCode.FAILED, error: err });
        }
      })
      .catch((e: any) => {
        diag.error(`[MiddlewareRum] OTLP export error: ${e?.message ?? e}`);
        resultCallback({ code: ExportResultCode.FAILED, error: e });
      });
  }

  shutdown(): Promise<void> {
    this.shutdownOnce = true;
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
