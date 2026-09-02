/**
 * What reaches the otel instrumentations decides whether a request carries `traceparent`, so
 * these assert on the constructor options rather than on any log output.
 *
 * The instrumentation classes are mocked inside the isolated registry: `middlewareRum` gets its
 * own copy of every module there, so a mock installed outside it would not be the one the SDK
 * constructs.
 */
type Captured = {
  xhr: any[];
  fetch: any[];
  disabled: string[];
};

function loadRum() {
  const captured: Captured = { xhr: [], fetch: [], disabled: [] };
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
        disable() {
          captured.disabled.push(kind);
        }
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

/** The `propagateTraceHeaderCorsUrls` both instrumentations were built with. */
function targetsFrom(config: Record<string, unknown>) {
  const { rum, captured } = loadRum();
  rum.init({ ...CONFIG, ...config });
  return {
    xhr: captured.xhr[0]?.propagateTraceHeaderCorsUrls,
    fetch: captured.fetch[0]?.propagateTraceHeaderCorsUrls,
    disabled: captured.disabled,
  };
}

/** Mirrors `urlMatches` in @opentelemetry/core: a RegExp matches, a string must equal. */
const propagatesTo = (targets: Array<string | RegExp>, url: string) =>
  targets.some((t) => (typeof t === 'string' ? url === t : !!url.match(t)));

describe('trace propagation targets', () => {
  it('propagates to every URL by default', () => {
    const { xhr, fetch } = targetsFrom({});

    expect(propagatesTo(xhr, 'https://api.example.com/orders')).toBe(true);
    expect(propagatesTo(fetch, 'https://anything.else/path')).toBe(true);
  });

  it('applies the same targets to fetch and XHR', () => {
    const { xhr, fetch } = targetsFrom({});

    expect(xhr).toEqual(fetch);
  });

  it('honours configured targets and excludes everything else', () => {
    const { xhr } = targetsFrom({
      tracePropagationTargets: [/api\.example\.com/],
    });

    expect(propagatesTo(xhr, 'https://api.example.com/orders')).toBe(true);
    expect(propagatesTo(xhr, 'https://third-party.io/track')).toBe(false);
  });

  it('treats an explicit empty array as propagate-to-nothing', () => {
    const { xhr } = targetsFrom({ tracePropagationTargets: [] });

    expect(xhr).toEqual([]);
    expect(propagatesTo(xhr, 'https://api.example.com/orders')).toBe(false);
  });
});

describe('networkInstrumentation flag', () => {
  it('disables both instrumentations when false', () => {
    expect(targetsFrom({ networkInstrumentation: false }).disabled).toEqual([
      'xhr',
      'fetch',
    ]);
  });

  it('leaves them enabled when true, matching its name', () => {
    // It previously meant the opposite: passing `true` disabled instrumentation.
    expect(targetsFrom({ networkInstrumentation: true }).disabled).toEqual([]);
  });

  it('leaves them enabled when unset', () => {
    expect(targetsFrom({}).disabled).toEqual([]);
  });
});
