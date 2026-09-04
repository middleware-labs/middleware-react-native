import { NativeModules, Platform } from 'react-native';
import { diag, trace, type Attributes } from '@opentelemetry/api';

export const LINKING_ERROR =
  `The package '@middleware.io/middleware-react-native' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go (run `npx expo run:android` / `npx expo run:ios`,\n' +
  '  or build a custom dev client with EAS — Expo Go cannot load custom native code)\n';

const tracer = trace.getTracer('logs');

/**
 * The native module, or null when it isn't linked into the running binary.
 *
 * This is deliberately NOT a throwing Proxy: under Expo Go — and any build
 * where autolinking didn't pick the package up — the very first native call
 * happens inside `MiddlewareRum.init()` during render, so throwing took down
 * the whole React tree. Now the JS pipeline stays alive and falls back to
 * exporting spans over OTLP/HTTP directly (see `otlpTraceExporter.ts`).
 */
const MiddlewareReactNative = NativeModules.MiddlewareReactNative ?? null;

let warnedMissing = false;

/** Whether the native SDK is present in the binary. */
export const isNativeSdkAvailable = (): boolean =>
  MiddlewareReactNative !== null;

type NativeInitState = 'pending' | 'ok' | 'failed';
let nativeInitState: NativeInitState = 'pending';

/**
 * Whether spans should still be handed to the native pipeline.
 *
 * Goes false once native initialization has definitively failed: the native
 * span exporter is only created inside a successful `initialize`, so after a
 * failure every `export` call is rejected and the spans are lost. Stays true
 * while init is still pending, so early batches keep the native path rather
 * than splitting across two transports at startup.
 */
export const isNativeExporterUsable = (): boolean =>
  isNativeSdkAvailable() && nativeInitState !== 'failed';

function reportMissingNativeModule(): void {
  if (warnedMissing) {
    return;
  }
  warnedMissing = true;
  diag.error(
    '[MiddlewareRum] native module not found — crash/ANR reporting and ' +
      'session recording are disabled, traces will be sent from JS over ' +
      'OTLP/HTTP instead.\n' +
      LINKING_ERROR
  );
}

/**
 * Runs a native call, swallowing both the "not linked" case and any rejection
 * from the native side. Every native entry point used to be an unguarded
 * floating promise, so native failures (a rejected `initialize`, a rejected
 * `export`) were completely invisible.
 */
function callNative<T>(
  method: string,
  invoke: (native: any) => Promise<T> | T,
  fallback: T
): Promise<T> {
  if (MiddlewareReactNative === null) {
    reportMissingNativeModule();
    return Promise.resolve(fallback);
  }
  try {
    return Promise.resolve(invoke(MiddlewareReactNative)).catch((e: any) => {
      diag.error(`[MiddlewareRum] native ${method} failed: ${e?.message ?? e}`);
      return fallback;
    });
  } catch (e: any) {
    diag.error(`[MiddlewareRum] native ${method} threw: ${e?.message ?? e}`);
    return Promise.resolve(fallback);
  }
}

export interface NativeSdKConfiguration {
  target: string;
  accountKey: string;
  sessionRecording: string;
  globalAttributes?: object;
  resourceAttributes?: object;
  serviceName: string;
  projectName: string;
  deploymentEnvironment?: string;
  sessionSamplingRatio?: number;
  recordingOptions?: {
    frequency?: string;
    quality?: string;
    maskAllTextInputs?: boolean;
    maskAllImages?: boolean;
  };
}

export type AppStartInfo = {
  appStart?: number;
  moduleStart: number;
  isColdStart?: boolean;
};

/**
 * Resolves even when the native SDK is missing or rejects, so the JS app-start
 * span is still produced and `init()` always completes.
 */
export const initializeNativeSdk = (
  config: NativeSdKConfiguration
): Promise<AppStartInfo> =>
  callNative<AppStartInfo | null>(
    'initialize',
    (n) => n.initialize(config),
    null
  ).then((info) => {
    nativeInitState = info === null ? 'failed' : 'ok';
    return info ?? { moduleStart: Date.now(), isColdStart: true };
  });

/** Resolves to false when the spans were not handed off to the native SDK. */
export const exportSpansToNative = (spans: object[]): Promise<boolean> =>
  callNative<boolean>('export', (n) => n.export(spans).then(() => true), false);

export const setNativeSessionId = (
  id: string,
  startTimeMs: number
): Promise<boolean> =>
  callNative('setSessionId', (n) => n.setSessionId(id, startTimeMs), false);

export const setNativeGlobalAttributes = (
  attributes: Attributes
): Promise<boolean> =>
  callNative(
    'setGlobalAttributes',
    (n) => n.setGlobalAttributes({ ...attributes }),
    false
  );

export const startNativeRecording = (): Promise<boolean> =>
  callNative('startRecording', (n) => n.startRecording(), false);

export const stopNativeRecording = (): Promise<boolean> =>
  callNative('stopRecording', (n) => n.stopRecording(), false);

export const isNativeRecording = (): Promise<boolean> =>
  callNative('isRecording', (n) => n.isRecording(), false);

/**
 * Pushes the JS route name into the native screen-name store so native tap
 * spans and the v3 session recording carry it instead of the host
 * Activity/ViewController class name.
 */
export const setNativeScreenName = (name: string) => {
  callNative('setScreenName', (n) => n.setScreenName(name), false);
};

export const testNativeCrash = () => {
  callNative('nativeCrash', (n) => n.nativeCrash(), false);
};

export const testNativeAnr = () => {
  callNative('nativeAnr', (n) => n.nativeAnr(), false);
};

export const info = (message: String) => {
  recordLog(message as string, 'info');
  callNative('info', (n) => n.info(message), false);
};

export const error = (message: String) => {
  recordLog(message as string, 'error');
  callNative('error', (n) => n.error(message), false);
};

export const warn = (message: String) => {
  recordLog(message as string, 'warn');
  callNative('warn', (n) => n.warn(message), false);
};

export const debug = (message: String) => {
  recordLog(message as string, 'debug');
  callNative('debug', (n) => n.debug(message), false);
};

const recordLog = (message: string, level: string) => {
  const span = tracer.startSpan(message, {
    attributes: {
      'event.type': level,
    },
  });
  span.end();
};
