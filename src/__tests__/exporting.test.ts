import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

function makeSpan(): ReadableSpan {
  return {
    name: 'AppStart',
    kind: SpanKind.INTERNAL,
    startTime: [1756400000, 1],
    endTime: [1756400001, 2],
    attributes: {},
    events: [],
    links: [],
    status: { code: SpanStatusCode.UNSET },
    resource: { attributes: { 'session.id': 'abc' } },
    instrumentationLibrary: { name: 'AppStart', version: '1' },
    duration: [1, 1],
    ended: true,
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
    spanContext: () => ({
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      traceFlags: 1,
    }),
  } as unknown as ReadableSpan;
}

/** Loads exporting.ts against a chosen NativeModules shape. */
function loadExporter(nativeModule: object | undefined) {
  let mod: any;
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({
      NativeModules: nativeModule
        ? { MiddlewareReactNative: nativeModule }
        : {},
      Platform: { OS: 'android', select: (o: any) => o.default },
    }));
    mod = require('../exporting').default;
  });
  return mod;
}

const OTLP = {
  target: 'https://myproject.middleware.io',
  accountKey: 'key',
};

describe('ReacNativeSpanExporter routing', () => {
  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, statusText: 'OK' }) as any;
  });

  it('hands spans to the native module when it is linked', async () => {
    const nativeExport = jest.fn().mockResolvedValue(null);
    const Exporter = loadExporter({ export: nativeExport });
    const result = await new Promise<ExportResult>((resolve) =>
      new Exporter(OTLP).export([makeSpan()], resolve)
    );
    expect(result.code).toBe(ExportResultCode.SUCCESS);
    expect(nativeExport).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reports FAILED when the native exporter rejects, instead of a silent SUCCESS', async () => {
    const nativeExport = jest
      .fn()
      .mockRejectedValue(new Error('Export: exporter not initialized'));
    const Exporter = loadExporter({ export: nativeExport });
    const result = await new Promise<ExportResult>((resolve) =>
      new Exporter(OTLP).export([makeSpan()], resolve)
    );
    expect(result.code).toBe(ExportResultCode.FAILED);
  });

  it('falls back to OTLP/HTTP when the native module is missing (Expo Go)', async () => {
    const Exporter = loadExporter(undefined);
    const result = await new Promise<ExportResult>((resolve) =>
      new Exporter(OTLP).export([makeSpan()], resolve)
    );
    expect(result.code).toBe(ExportResultCode.SUCCESS);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://myproject.middleware.io/v1/traces'
    );
  });

  it('reports FAILED when native is missing and no OTLP fallback is configured', async () => {
    const Exporter = loadExporter(undefined);
    const result = await new Promise<ExportResult>((resolve) =>
      new Exporter().export([makeSpan()], resolve)
    );
    expect(result.code).toBe(ExportResultCode.FAILED);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('never throws synchronously when the native module is absent', () => {
    const Exporter = loadExporter(undefined);
    expect(() =>
      new Exporter(OTLP).export([makeSpan()], () => {})
    ).not.toThrow();
  });

  describe('after a failed native initialize', () => {
    /** Loads exporting + native together so init state is shared. */
    function loadWithNative(nativeModule: object) {
      let mods: any;
      jest.isolateModules(() => {
        jest.doMock('react-native', () => ({
          NativeModules: { MiddlewareReactNative: nativeModule },
          Platform: { OS: 'android', select: (o: any) => o.default },
        }));
        mods = {
          Exporter: require('../exporting').default,
          native: require('../native'),
        };
      });
      return mods;
    }

    const CONFIG = { target: 't', accountKey: 'k' } as any;

    it('routes to OTLP once native initialize has rejected', async () => {
      // Reproduces the real failure: the module IS linked, but initialize
      // threw ("Method addObserver must be called on the main thread"), so
      // the native span exporter was never created.
      const { Exporter, native } = loadWithNative({
        initialize: jest
          .fn()
          .mockRejectedValue(
            new Error('Method addObserver must be called on the main thread')
          ),
        export: jest.fn().mockResolvedValue(null),
      });

      expect(native.isNativeExporterUsable()).toBe(true); // pending
      await native.initializeNativeSdk({} as any);
      expect(native.isNativeExporterUsable()).toBe(false); // failed

      const result = await new Promise<ExportResult>((resolve) =>
        new Exporter(CONFIG).export([makeSpan()], resolve)
      );
      expect(result.code).toBe(ExportResultCode.SUCCESS);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('still resolves app-start info so the AppStart span is produced', async () => {
      const { native } = loadWithNative({
        initialize: jest.fn().mockRejectedValue(new Error('boom')),
      });
      const info = await native.initializeNativeSdk({} as any);
      expect(typeof info.moduleStart).toBe('number');
      expect(info.isColdStart).toBe(true);
    });

    it('keeps using native after a successful initialize', async () => {
      const nativeExport = jest.fn().mockResolvedValue(null);
      const { Exporter, native } = loadWithNative({
        initialize: jest
          .fn()
          .mockResolvedValue({ moduleStart: 1, isColdStart: true }),
        export: nativeExport,
      });
      await native.initializeNativeSdk({} as any);
      expect(native.isNativeExporterUsable()).toBe(true);

      await new Promise<ExportResult>((resolve) =>
        new Exporter(CONFIG).export([makeSpan()], resolve)
      );
      expect(nativeExport).toHaveBeenCalledTimes(1);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
