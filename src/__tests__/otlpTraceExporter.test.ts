import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import OtlpHttpTraceExporter from '../otlpTraceExporter';

const RESOURCE = {
  attributes: {
    'service.name': 'Mobile-SDK-ReactNative',
    'session.id': 'abc123',
    'recording': '1',
  },
} as any;

function makeSpan(over: Partial<ReadableSpan> = {}): ReadableSpan {
  return {
    name: 'AppStart',
    kind: SpanKind.INTERNAL,
    // 1756400000.123456789 -> exercises sub-microsecond precision
    startTime: [1756400000, 123456789],
    endTime: [1756400001, 987654321],
    attributes: { 'event.type': 'app_activity', 'http.status_code': 200 },
    events: [],
    links: [],
    status: { code: SpanStatusCode.UNSET },
    resource: RESOURCE,
    instrumentationLibrary: { name: 'AppStart', version: '1.0.0' },
    duration: [1, 864197532],
    ended: true,
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
    spanContext: () => ({
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      traceFlags: 1,
    }),
    ...over,
  } as unknown as ReadableSpan;
}

function lastRequest() {
  const mock = global.fetch as jest.Mock;
  const [url, init] = mock.mock.calls[mock.mock.calls.length - 1];
  return { url, init, body: JSON.parse(init.body) };
}

describe('OtlpHttpTraceExporter', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    }) as any;
  });

  const exporter = () =>
    new OtlpHttpTraceExporter({
      target: 'https://myproject.middleware.io',
      accountKey: 'test-account-key',
    });

  it('posts to {target}/v1/traces with the Middleware auth headers', async () => {
    await new Promise<ExportResult>((resolve) =>
      exporter().export([makeSpan()], resolve)
    );
    const { url, init } = lastRequest();
    expect(url).toBe('https://myproject.middleware.io/v1/traces');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('test-account-key');
    expect(init.headers.Origin).toBe('sdk.middleware.io');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('strips a trailing slash from target so the URL stays valid', async () => {
    const e = new OtlpHttpTraceExporter({
      target: 'https://myproject.middleware.io/',
      accountKey: 'k',
    });
    await new Promise<ExportResult>((resolve) =>
      e.export([makeSpan()], resolve)
    );
    expect(lastRequest().url).toBe('https://myproject.middleware.io/v1/traces');
  });

  it('emits nanosecond timestamps exactly, without float rounding', async () => {
    await new Promise<ExportResult>((resolve) =>
      exporter().export([makeSpan()], resolve)
    );
    const span = lastRequest().body.resourceSpans[0].scopeSpans[0].spans[0];
    // Epoch nanos exceed Number.MAX_SAFE_INTEGER, so these must be strings
    // carrying every digit.
    expect(span.startTimeUnixNano).toBe('1756400000123456789');
    expect(span.endTimeUnixNano).toBe('1756400001987654321');
    expect(Number(span.startTimeUnixNano)).toBeGreaterThan(
      Number.MAX_SAFE_INTEGER
    );
  });

  it('pads sub-second nanos to 9 digits', async () => {
    await new Promise<ExportResult>((resolve) =>
      exporter().export(
        [makeSpan({ startTime: [1756400000, 42] as any })],
        resolve
      )
    );
    const span = lastRequest().body.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.startTimeUnixNano).toBe('1756400000000000042');
  });

  it('shifts SpanKind into the OTLP enum (INTERNAL 0 -> 1)', async () => {
    await new Promise<ExportResult>((resolve) =>
      exporter().export(
        [makeSpan(), makeSpan({ kind: SpanKind.CLIENT })],
        resolve
      )
    );
    const spans = lastRequest().body.resourceSpans[0].scopeSpans[0].spans;
    expect(spans[0].kind).toBe(1); // INTERNAL
    expect(spans[1].kind).toBe(3); // CLIENT
  });

  it('encodes attributes as typed OTLP AnyValues', async () => {
    await new Promise<ExportResult>((resolve) =>
      exporter().export(
        [
          makeSpan({
            attributes: {
              str: 'a',
              int: 200,
              float: 1.5,
              bool: true,
              arr: ['x', 'y'],
            } as any,
          }),
        ],
        resolve
      )
    );
    const attrs = lastRequest().body.resourceSpans[0].scopeSpans[0].spans[0]
      .attributes as Array<{ key: string; value: any }>;
    const byKey = Object.fromEntries(attrs.map((a) => [a.key, a.value]));
    expect(byKey.str).toEqual({ stringValue: 'a' });
    expect(byKey.int).toEqual({ intValue: '200' });
    expect(byKey.float).toEqual({ doubleValue: 1.5 });
    expect(byKey.bool).toEqual({ boolValue: true });
    expect(byKey.arr).toEqual({
      arrayValue: { values: [{ stringValue: 'x' }, { stringValue: 'y' }] },
    });
  });

  it('carries resource attributes so sessions link up in the backend', async () => {
    await new Promise<ExportResult>((resolve) =>
      exporter().export([makeSpan()], resolve)
    );
    const attrs = lastRequest().body.resourceSpans[0].resource
      .attributes as Array<{ key: string; value: any }>;
    expect(attrs).toContainEqual({
      key: 'session.id',
      value: { stringValue: 'abc123' },
    });
    expect(attrs).toContainEqual({
      key: 'recording',
      value: { stringValue: '1' },
    });
  });

  it('groups spans into one scopeSpans entry per instrumentation scope', async () => {
    await new Promise<ExportResult>((resolve) =>
      exporter().export(
        [
          makeSpan(),
          makeSpan(),
          makeSpan({
            instrumentationLibrary: {
              name: 'uiChanges',
              version: '1.0.0',
            } as any,
          }),
        ],
        resolve
      )
    );
    const scopes = lastRequest().body.resourceSpans[0].scopeSpans;
    expect(scopes).toHaveLength(2);
    expect(scopes.map((s: any) => s.scope.name).sort()).toEqual([
      'AppStart',
      'uiChanges',
    ]);
    expect(
      scopes.find((s: any) => s.scope.name === 'AppStart').spans
    ).toHaveLength(2);
  });

  it('reports FAILED on a non-2xx so BatchSpanProcessor can see it', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    }) as any;
    const result = await new Promise<ExportResult>((resolve) =>
      exporter().export([makeSpan()], resolve)
    );
    expect(result.code).toBe(ExportResultCode.FAILED);
    expect(result.error?.message).toContain('401');
  });

  it('reports FAILED on a network error instead of throwing', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('Network request failed')) as any;
    const result = await new Promise<ExportResult>((resolve) =>
      exporter().export([makeSpan()], resolve)
    );
    expect(result.code).toBe(ExportResultCode.FAILED);
  });

  it('does not post after shutdown', async () => {
    const e = exporter();
    await e.shutdown();
    const result = await new Promise<ExportResult>((resolve) =>
      e.export([makeSpan()], resolve)
    );
    expect(result.code).toBe(ExportResultCode.SUCCESS);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('skips the request for an empty batch', async () => {
    await new Promise<ExportResult>((resolve) =>
      exporter().export([], resolve)
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
