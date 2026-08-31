import { hrTimeToMilliseconds } from '@opentelemetry/core';
import type { AppStartInfo } from '../native';

/**
 * Loads middlewareRum.ts with a stubbed native bridge. The app-start payload
 * is resolved lazily so a test can build it relative to the session that the
 * freshly loaded session module just started.
 */
function loadRum() {
  const holder: { info: AppStartInfo } = {
    info: { moduleStart: Date.now(), isColdStart: true },
  };
  let mod: any;
  jest.isolateModules(() => {
    jest.doMock('../native', () => {
      // Every bridge call is a no-op under test; only the app-start payload
      // and the "no native SDK" answers need to be real.
      const stubs: Record<string, any> = {
        __esModule: true,
        initializeNativeSdk: jest
          .fn()
          .mockImplementation(() => Promise.resolve(holder.info)),
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
    mod = {
      rum: require('../middlewareRum').MiddlewareRum,
      sessionStart: require('../session').getSessionStartTime() as number,
    };
  });
  return { ...mod, holder };
}

const CONFIG = {
  target: 'https://myproject.middleware.io',
  accountKey: 'key',
  projectName: 'proj',
  serviceName: 'svc',
  appStartEnabled: true,
};

/** Start time the AppStart span was actually created with, in epoch ms. */
function appStartMs(rum: any): number {
  return hrTimeToMilliseconds((rum.appStartSpan as any).startTime);
}

describe('AppStart span start time', () => {
  // The XHR instrumentation patches XMLHttpRequest.prototype on construction;
  // the node test environment has no such global.
  beforeAll(() => {
    (global as any).XMLHttpRequest = class {
      open() {}
      send() {}
      setRequestHeader() {}
      addEventListener() {}
    };
  });

  it('keeps the native app start when it falls inside the current session', async () => {
    const { rum, sessionStart, holder } = loadRum();
    const appStart = sessionStart + 5;
    holder.info = { appStart, moduleStart: appStart, isColdStart: true };

    rum.init(CONFIG);
    await new Promise((r) => setImmediate(r));

    expect(rum.appStartSpan).toBeDefined();
    expect(appStartMs(rum)).toBe(appStart);
    expect((rum.appStartSpan as any).attributes['start.type']).toBe('cold');
  });

  it('does not backdate AppStart to a process that outlived an earlier session', async () => {
    const { rum, sessionStart, holder } = loadRum();
    // A native process alive since the previous day — what a surviving
    // process reports once the JS context has been recreated. Left unclamped
    // this rewrites SessionStart, which the backend derives from
    // min(span timestamp), and a 15-minute session reads as 11 hours long.
    const staleStart = sessionStart - 11 * 60 * 60 * 1000;
    holder.info = {
      appStart: staleStart,
      moduleStart: staleStart,
      isColdStart: true,
    };

    rum.init(CONFIG);
    await new Promise((r) => setImmediate(r));

    expect(rum.appStartSpan).toBeDefined();
    expect(appStartMs(rum)).toBe(sessionStart);
    expect((rum.appStartSpan as any).attributes['start.type']).toBe('warm');
  });
});
