/**
 * Fetch request-body capture is exercised by calling the
 * `applyCustomAttributesOnSpan` hook the SDK passes to FetchInstrumentation.
 */
type Captured = {
  fetch: any[];
};

function loadRum() {
  const captured: Captured = { fetch: [] };
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
          if (kind === 'fetch') {
            captured.fetch.push(options);
          }
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

describe('fetch request body capture', () => {
  it('records http.request.body from the request, not the response', () => {
    const { rum, captured } = loadRum();
    rum.init({
      target: 'https://myproject.middleware.io',
      accountKey: 'key',
      projectName: 'proj',
      serviceName: 'svc',
    });

    const span = fakeSpan();
    const requestBody = JSON.stringify({ total: 12.5 });
    captured.fetch[0].applyCustomAttributesOnSpan(
      span,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      },
      new Response(JSON.stringify({ id: 1 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    );

    expect(span.attributes['http.request.body']).toBe(requestBody);
  });
});

export {};
