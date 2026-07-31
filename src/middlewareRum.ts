import {
  context,
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  trace,
  type Attributes,
  type Span,
} from '@opentelemetry/api';
import {
  _globalThis,
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import type { FetchError } from '@opentelemetry/instrumentation-fetch/build/src/types';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import shimmer from '@opentelemetry/instrumentation/build/src/shimmer';
import { B3InjectEncoding, B3Propagator } from '@opentelemetry/propagator-b3';
import { Resource } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { LOCATION_LATITUDE, LOCATION_LONGITUDE } from './constants';
import { instrumentErrors, reportError } from './errors';
import ReacNativeSpanExporter from './exporting';
import GlobalAttributeAppender from './globalAttributeAppender';
import { getResource, setGlobalAttributes } from './globalAttributes';
import {
  debug,
  error,
  info,
  initializeNativeSdk,
  isNativeRecording,
  setNativeSessionId,
  startNativeRecording,
  stopNativeRecording,
  testNativeAnr,
  testNativeCrash,
  warn,
  type AppStartInfo,
  type NativeSdKConfiguration,
} from './native';
import { captureTraceParent } from './serverTiming';
import {
  _generatenewSessionId,
  getSessionId,
  getSessionStartTime,
} from './session';
import { headerCapture, jsonToString } from './utils';

export interface RecordingOptions {
  /** Capture frequency: 'low' (~1 FPS, default) | 'standard' (~3 FPS) | 'high' (10 FPS). */
  frequency?: 'low' | 'standard' | 'high';
  /** Image quality of recorded frames. */
  quality?: 'low' | 'standard' | 'high';
  /** Mask all text in the recording (secure inputs are always masked). Default true. */
  maskAllTextInputs?: boolean;
  /** Mask image content in the recording. Default true. */
  maskAllImages?: boolean;
}

export interface ReactNativeConfiguration {
  target: string;
  accountKey: string;
  serviceName: string;
  projectName: string;
  sessionRecording?: boolean;
  /** Options for v3 session recording (rrweb screenshot events). */
  recordingOptions?: RecordingOptions;
  /** Falls back to the legacy (v2) screenshot recorder when true. */
  disableSessionRecordingV3?: boolean;
  /** Fraction of sessions to sample for traces + recordings, 0.0–1.0. */
  sessionSamplingRatio?: number;
  deploymentEnvironment?: string;
  appStartEnabled?: boolean;
  /** @deprecated never wired to native; will be removed. */
  enableDiskBuffering?: boolean;
  /** @deprecated never wired to native; will be removed. */
  limitDiskUsageMegabytes?: number;
  /** @deprecated never wired to native; will be removed. */
  truncationCheckpoint?: number;
  /** @deprecated never wired to native; will be removed. */
  bufferTimeout?: number;
  /** @deprecated never wired to native; will be removed. */
  bufferSize?: number;
  debug?: boolean;
  /** Sets attributes added to every Span. */
  globalAttributes?: Attributes;
  tracePropagationTargets?: Array<string | RegExp>;
  tracePropagationFormat?: string;
  networkInstrumentation?: boolean;
  /**
   * URLs that partially match any regex in ignoreUrls will not be traced.
   * In addition, URLs that are _exact matches_ of strings in ignoreUrls will
   * also not be traced.
   */
  ignoreUrls?: Array<string | RegExp>;
  /**
   * Headers that should be ignored during tracing.
   */
  ignoreHeaders?: Set<string>;
}

export interface MiddlewareRumType {
  appStartSpan?: Span | undefined;
  appStartEnd: number | null;
  finishAppStart: () => void;
  init: (options: ReactNativeConfiguration) => MiddlewareRumType | undefined;
  provider?: WebTracerProvider;
  _generatenewSessionId: () => void;
  _testNativeCrash: () => void;
  _testNativeAnr: () => void;
  reportError: (err: any, isFatal?: boolean) => void;
  setGlobalAttributes: (attributes: Attributes) => void;
  updateLocation: (latitude: number, longitude: number) => void;
  getSessionId: () => string;
  /**
   * Starts session recording, overriding both `sessionRecording: false` and the
   * session sampler. Sticky: recording keeps running across session rotations
   * until `stopRecording()` is called.
   *
   * @returns whether recording is running after the call.
   */
  startRecording: () => Promise<boolean>;
  /**
   * Stops session recording. Sticky: recording stays off across session
   * rotations until `startRecording()` is called.
   */
  stopRecording: () => Promise<boolean>;
  /** Whether session recording is currently running. */
  isRecording: () => Promise<boolean>;
  info: (message: String) => void;
  debug: (message: String) => void;
  warn: (message: String) => void;
  error: (message: String) => void;
}

const DEFAULT_CONFIG = {
  appStartEnabled: true,
  enableDiskBuffering: true,
};

let appStartInfo: AppStartInfo | null = null;
let isInitialized = false;

// Live recording state, mirrored onto the provider resource so exported spans
// always carry the current `recording`/`recordingV3` values. Recording can be
// toggled at runtime, and these attributes are what tell the backend a session
// has a replay to play back.
let isRecordingActive = false;
let isRecordingV3Configured = true;

const updateLocation = (latitude: number, longitude: number) => {
  setGlobalAttributes({
    [LOCATION_LATITUDE]: latitude,
    [LOCATION_LONGITUDE]: longitude,
  });
};

const startRecording = async (): Promise<boolean> => {
  const started = await startNativeRecording();
  if (started) {
    isRecordingActive = true;
  }
  return started;
};

const stopRecording = async (): Promise<boolean> => {
  const stopped = await stopNativeRecording();
  if (stopped) {
    isRecordingActive = false;
  }
  return stopped;
};

export const MiddlewareRum: MiddlewareRumType = {
  appStartEnd: null,
  finishAppStart() {
    if (this.appStartSpan && this.appStartSpan.isRecording()) {
      this.appStartSpan.end();
    } else {
      this.appStartEnd = Date.now();
      MiddlewareRum.debug('AppStart: end called without start');
      diag.debug('AppStart: end called without start');
    }
  },
  init(configuration: ReactNativeConfiguration) {
    const config = {
      ...DEFAULT_CONFIG,
      ...configuration,
    };

    diag.setLogger(
      new DiagConsoleLogger(),
      config?.debug ? DiagLogLevel.DEBUG : DiagLogLevel.ERROR
    );

    if (isInitialized) {
      diag.warn('MiddlewareRum already initiated.');
      return;
    }
    //by default wants to use otlp
    if (!('OTEL_TRACES_EXPORTER' in _globalThis)) {
      (_globalThis as any).OTEL_TRACES_EXPORTER = 'none';
    }

    const clientInit = Date.now();
    if (!config.serviceName || !config.projectName) {
      diag.error('serviceName & projectName name is required.');
      return;
    }

    if (!config.target) {
      diag.error('Target url is required.');
      return;
    }

    if (!config.accountKey) {
      diag.error('Middleware account key is required.');
      return;
    }

    let sessionRecording: string;
    if (config.sessionRecording) {
      sessionRecording = 'true';
    } else if (config.sessionRecording === false) {
      sessionRecording = 'false';
    } else {
      sessionRecording = 'true';
    }

    isRecordingActive = sessionRecording === 'true';
    isRecordingV3Configured = !config.disableSessionRecordingV3;

    const recordingAttr = sessionRecording === 'true' ? '1' : '0';
    // recordingV3 routes bifrost to the rrweb player; matches the native
    // SDKs' resource attribute (v3 is on by default when recording is on).
    const recordingV3Attr =
      sessionRecording === 'true' && !config.disableSessionRecordingV3
        ? '1'
        : '0';
    const resourceAttributes = {
      ...getResource(),
      [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
      'project.name': config.projectName,
      'env': config.deploymentEnvironment,
      'recording': recordingAttr,
      'recordingV3': recordingV3Attr,
      'session.id': getSessionId(),
      'session.start_time': getSessionStartTime(),
    };
    const attributes = config.globalAttributes || {};
    const nativeSdkConf: NativeSdKConfiguration = {
      target: config.target,
      accountKey: config.accountKey,
      serviceName: config.serviceName,
      projectName: config.projectName,
      sessionRecording,
      globalAttributes: attributes,
      resourceAttributes: resourceAttributes,
      ...(config.deploymentEnvironment !== undefined && {
        deploymentEnvironment: config.deploymentEnvironment,
      }),
      ...(config.sessionSamplingRatio !== undefined && {
        sessionSamplingRatio: config.sessionSamplingRatio,
      }),
      ...(config.disableSessionRecordingV3 !== undefined && {
        disableSessionRecordingV3: config.disableSessionRecordingV3,
      }),
      ...(config.recordingOptions !== undefined && {
        recordingOptions: config.recordingOptions,
      }),
    };

    setGlobalAttributes(attributes);

    const provider = new WebTracerProvider({
      resource: new Resource({
        ...resourceAttributes,
      }),
    });
    provider.addSpanProcessor(new GlobalAttributeAppender());

    Object.defineProperty(provider.resource.attributes, 'session.id', {
      get() {
        return getSessionId();
      },
      configurable: true,
      enumerable: true,
    });

    Object.defineProperty(provider.resource.attributes, 'session.start_time', {
      get() {
        return getSessionStartTime();
      },
      configurable: true,
      enumerable: true,
    });

    // Read live so startRecording()/stopRecording() are reflected on every
    // exported span rather than frozen at the value configured at init.
    Object.defineProperty(provider.resource.attributes, 'recording', {
      get() {
        return isRecordingActive ? '1' : '0';
      },
      configurable: true,
      enumerable: true,
    });

    Object.defineProperty(provider.resource.attributes, 'recordingV3', {
      get() {
        return isRecordingActive && isRecordingV3Configured ? '1' : '0';
      },
      configurable: true,
      enumerable: true,
    });

    provider.addSpanProcessor(
      new BatchSpanProcessor(new ReacNativeSpanExporter())
    );

    if (config.tracePropagationFormat === 'w3c') {
      provider.register({
        propagator: new CompositePropagator({
          propagators: [
            new W3CBaggagePropagator(),
            new W3CTraceContextPropagator(),
          ],
        }),
      });
    } else if (config.tracePropagationFormat === 'b3') {
      provider.register({
        propagator: new CompositePropagator({
          propagators: [
            new B3Propagator(),
            new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER }),
          ],
        }),
      });
    } else {
      provider.register({
        propagator: new CompositePropagator({
          propagators: [
            new W3CBaggagePropagator(),
            new W3CTraceContextPropagator(),
            new B3Propagator(),
            new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER }),
          ],
        }),
      });
    }

    this.provider = provider;
    const clientInitEnd = Date.now();
    instrumentErrors();

    const nativeInit = Date.now();

    diag.debug(
      'Initializing with: ',
      nativeSdkConf.serviceName,
      nativeSdkConf.projectName,
      nativeSdkConf.target
    );

    const DEFAULT_IGNORE_URLS: (string | RegExp)[] | undefined = [
      `${config.target}/v1/metrics`,
      `${config.target}/v1/traces`,
      `${config.target}/v1/logs`,
      `${config.target}/v1/rum`,
      ...(config.ignoreUrls ?? []),
    ];

    // The React Native implementation of fetch is simply a polyfill on top of XMLHttpRequest:
    // https://github.com/facebook/react-native/blob/7ccc5934d0f341f9bc8157f18913a7b340f5db2d/packages/react-native/Libraries/Network/fetch.js#L17
    // Because of this when making requests using `fetch` there will an additional span created for the underlying
    // request made with XMLHttpRequest. Since in this demo calls to /api/ are made using fetch, turn off
    // instrumentation for that path to avoid the extra spans.
    const xhrInstrumentation = new XMLHttpRequestInstrumentation({
      propagateTraceHeaderCorsUrls: config.tracePropagationTargets ?? [],
      clearTimingResources: false,
      ignoreUrls: DEFAULT_IGNORE_URLS,
      applyCustomAttributesOnSpan: (span: Span, xhr: XMLHttpRequest) => {
        if (span) {
          xhr.addEventListener('readystatechange', function () {
            if (xhr.readyState === xhr.OPENED) {
              shimmer.wrap(xhr, 'setRequestHeader', (original) => {
                return (header, value) => {
                  headerCapture(
                    'request',
                    [header],
                    config.ignoreHeaders
                  )(span, () => value);
                  return original.call(this, header, value);
                };
              });
              shimmer.wrap(xhr, 'open', (original) => {
                return (method, url) => {
                  span.updateName(`HTTP ${method.toUpperCase()} ${url}`);
                  return original.call(this, method, url);
                };
              });
              shimmer.wrap(xhr, 'send', (original) => {
                return (body) => {
                  if (body) {
                    span.setAttribute('http.request.body', body.toString());
                  }
                  return original.call(this, body);
                };
              });
            } else if (xhr.readyState === xhr.DONE) {
              const headers = xhr
                .getAllResponseHeaders()
                .split('\r\n')
                .reduce((result: Record<string, string>, current) => {
                  let [name, value] = current.split(': ');
                  if (name && value) {
                    result[name] = value;
                  }
                  return result;
                }, {} as Record<string, string>);
              headerCapture(
                'response',
                Object.keys(headers),
                config.ignoreHeaders
              )(span, (header) => headers[header]);
              try {
                span.setAttribute('http.response.body', xhr.responseText);
              } catch (e) {
                // ignore (DOMException if responseType is not the empty string or "text")
              }
              shimmer.unwrap(xhr, 'setRequestHeader');
              shimmer.unwrap(xhr, 'send');
            }
          });

          // don't care about success/failure, just want to see response headers if they exist
          xhr.addEventListener('readystatechange', function () {
            if (xhr.readyState === xhr.HEADERS_RECEIVED) {
              const headers = xhr.getAllResponseHeaders().toLowerCase();
              if (headers.indexOf('server-timing') !== -1) {
                const st = xhr.getResponseHeader('server-timing');
                if (st !== null) {
                  captureTraceParent(st, span);
                }
              }
            }
          });
          const httpURL = (span as unknown as { attributes: Attributes })
            ?.attributes?.['http.url'];
          if (httpURL) {
            span.updateName(
              `${(span as unknown as { name: string }).name} ${httpURL}`
            );
          }
          span.setAttribute('event.type', 'xhr');
        }
      },
    });
    const fetchInstrumentation = new FetchInstrumentation({
      propagateTraceHeaderCorsUrls: config.tracePropagationTargets ?? [],
      clearTimingResources: false,
      ignoreUrls: DEFAULT_IGNORE_URLS,
      applyCustomAttributesOnSpan: (
        s: Span | { span: Span; attributes: Attributes; name: string },
        request: Request | RequestInit,
        result: Response | FetchError
      ) => {
        const r = request as Request;
        const res = result as RequestInit;
        const span = s as Span;
        const httpURL = (
          s as { span: Span; attributes: Attributes; name: string }
        ).attributes?.['http.url'];
        if (httpURL) {
          span.updateName(
            `${
              (s as { span: Span; attributes: Attributes; name: string }).name
            } ${httpURL}`
          );
        }
        span.setAttribute('event.type', 'fetch');
        if (r.headers instanceof Headers) {
          headerCapture(
            'request',
            Object.keys(r.headers),
            config.ignoreHeaders
          )(span, (header: string) => r.headers?.get(header) ?? '');
        }
        if (res.body) {
          span.setAttribute('http.request.body', res.body.toString());
        }
        if (result instanceof Response) {
          if (result.headers instanceof Headers) {
            const headerNames: string[] = [];
            result.headers.forEach((_: string, name: string) => {
              headerNames.push(name);
            });
            headerCapture(
              'response',
              headerNames,
              config.ignoreHeaders
            )(span, (header) => (result.headers?.get(header) as string) ?? '');
            const contentType = result.headers?.get('Content-Type') ?? '';
            const ALLOWED_CONTENT_TYPE = new Set([
              'application/json',
              'application/json;charset=utf-8',
              'text/plain',
              'text/x-component',
            ]);
            if (contentType && ALLOWED_CONTENT_TYPE.has(contentType)) {
              result
                .clone()
                .json()
                .then((response) => {
                  span.setAttribute(
                    'http.response.body',
                    jsonToString(response)
                  );
                })
                .catch(() => {
                  // Ignore
                });
            }
          }
        }
      },
    });

    if (config.networkInstrumentation) {
      xhrInstrumentation.disable();
      fetchInstrumentation.disable();
    }
    registerInstrumentations({
      instrumentations: [xhrInstrumentation, fetchInstrumentation],
    });

    initializeNativeSdk(nativeSdkConf).then((nativeAppStart) => {
      appStartInfo = nativeAppStart;
      appStartInfo.isColdStart = appStartInfo.isColdStart || true;
      appStartInfo.appStart = appStartInfo.appStart || appStartInfo.moduleStart;
      setNativeSessionId(getSessionId(), getSessionStartTime());

      if (config.appStartEnabled) {
        const tracer = provider.getTracer('AppStart');
        const nativeInitEnd = Date.now();

        this.appStartSpan = tracer.startSpan('AppStart', {
          startTime: appStartInfo.appStart,
          attributes: {
            'component': 'appstart',
            'event.type': 'app_activity',
            'start.type': appStartInfo.isColdStart ? 'cold' : 'warm',
          },
        });

        const ctx = trace.setSpan(context.active(), this.appStartSpan);

        context.with(ctx, () => {
          tracer
            .startSpan('MiddlewareRum.nativeInit', { startTime: nativeInit })
            .end(nativeInitEnd);
          tracer
            .startSpan('MiddlewareRum.jsInit', { startTime: clientInit })
            .end(clientInitEnd);
        });

        if (this.appStartEnd !== null) {
          diag.debug('AppStart: using manual end');
          MiddlewareRum.debug('AppStart: using manual end');
          this.appStartSpan.end(this.appStartEnd);
        }
      }
    });
    isInitialized = true;
    return this;
  },
  _generatenewSessionId: _generatenewSessionId,
  _testNativeCrash: testNativeCrash,
  _testNativeAnr: testNativeAnr,
  reportError: reportError,
  setGlobalAttributes: setGlobalAttributes,
  updateLocation: updateLocation,
  getSessionId: getSessionId,
  startRecording: startRecording,
  stopRecording: stopRecording,
  isRecording: isNativeRecording,
  info: info,
  error: error,
  debug: debug,
  warn: warn,
};
