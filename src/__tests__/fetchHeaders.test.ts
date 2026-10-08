/**
 * Fetch request-header capture is exercised by calling the
 * `applyCustomAttributesOnSpan` hook the SDK passes to FetchInstrumentation.
 *
 * `middlewareRum` is loaded in an isolated registry (same pattern as
 * tracePropagation.test.ts) so the instrumentation constructor we mock is
 * the one `init()` actually constructs.
 */
type Captured = {
  xhr: any[];
  fetch: any[];
};

function loadRum() {
  const captured: Captured = { xhr: [], fetch: [] };
  let rum: any;

  jest.isolateModules(() => {
    jest.doMock('../native', () => {
      const stubs: Record<string, any> = {
        __esModule: true,
        initializeNativeSdk: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve({ moduleStart: Date.now(), isColdStart: true })
          ),
        isNativeSdkAvailable: jest.fn().mockReturnValue(false),
        isNativeExporterUsable: jest.fn().mockReturnValue(false),
        isNativeRecording: jest.fn().mockResolvedValue(false),
      };
      return new Proxy(stubs, {
        get(target, key: string) {
          if (!(key in target)) {
            target[key] = jest.fn();
          }
          return target[key];
        },
      });
    });

    const fakeInstrumentation = (kind: 'xhr' | 'fetch') =>
      class {
        constructor(options: any) {
          captured[kind].push(options);
        }
        disable() {}
        enable() {}
        setTracerProvider() {}
        setMeterProvider() {}
        setConfig() {}
        getConfig() {
          return {};
        }
      };

    jest.doMock('@opentelemetry/instrumentation-xml-http-request', () => ({
      XMLHttpRequestInstrumentation: fakeInstrumentation('xhr'),
    }));
    jest.doMock('@opentelemetry/instrumentation-fetch', () => ({
      FetchInstrumentation: fakeInstrumentation('fetch'),
    }));
    jest.doMock('@opentelemetry/instrumentation', () => ({
      registerInstrumentations: jest.fn(),
    }));

    rum = require('../middlewareRum').MiddlewareRum;
  });

  return { rum, captured };
}

const CONFIG = {
  target: 'https://myproject.middleware.io',
  accountKey: 'key',
  projectName: 'proj',
  serviceName: 'svc',
};

function fakeSpan() {
  const attributes: Record<string, unknown> = {};
  return {
    attributes,
    setAttribute: jest.fn((key: string, value: unknown) => {
      attributes[key] = value;
    }),
    updateName: jest.fn(),
  };
}

function captureRequestHeaders(
  request: Request | RequestInit,
  extraConfig: Record<string, unknown> = {}
) {
  const { rum, captured } = loadRum();
  rum.init({ ...CONFIG, ...extraConfig });
  const span = fakeSpan();
  captured.fetch[0].applyCustomAttributesOnSpan(span, request, {});
  return span.attributes;
}

describe('fetch request header capture', () => {
  it('captures headers passed as a Headers instance', () => {
    const attributes = captureRequestHeaders({
      headers: new Headers({ 'x-foo': 'bar' }),
    });

    expect(attributes['http.request.header.x_foo']).toBe('bar');
  });

  it('captures headers passed as a plain object', () => {
    const attributes = captureRequestHeaders({
      headers: { 'x-foo': 'bar', 'content-type': 'application/json' },
    });

    expect(attributes['http.request.header.x_foo']).toBe('bar');
    expect(attributes['http.request.header.content_type']).toBe(
      'application/json'
    );
  });

  it('does not record a junk http.request.header.map attribute', () => {
    const headers = new Headers({ 'x-foo': 'bar' });
    Object.defineProperty(headers, 'map', {
      value: { 'x-foo': ['bar'] },
      enumerable: true,
    });

    const attributes = captureRequestHeaders({ headers });

    expect(attributes['http.request.header.map']).toBeUndefined();
    expect(attributes['http.request.header.x_foo']).toBe('bar');
  });

  it('skips a header listed in ignoreHeaders', () => {
    const attributes = captureRequestHeaders(
      { headers: { 'x-foo': 'bar', 'x-secret': 'hidden' } },
      { ignoreHeaders: new Set(['x-secret']) }
    );

    expect(attributes['http.request.header.x_foo']).toBe('bar');
    expect(attributes['http.request.header.x_secret']).toBeUndefined();
  });

  it('masks x-access-token', () => {
    const attributes = captureRequestHeaders({
      headers: { 'x-access-token': 'super-secret' },
    });

    expect(attributes['http.request.header.x_access_token']).toBe('********');
  });
});

export {};
