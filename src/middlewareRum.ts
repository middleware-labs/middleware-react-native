import {
  DiagConsoleLogger,
  DiagLogLevel,
  context,
  diag,
  trace,
  type Attributes,
  type Span,
} from '@opentelemetry/api';
import { _globalThis } from '@opentelemetry/core';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import GlobalAttributeAppender from './globalAttributeAppender';
import {
  initializeNativeSdk,
  setNativeSessionId,
  testNativeCrash,
  type AppStartInfo,
  type NativeSdKConfiguration,
  info,
  warn,
  debug,
  error,
  testNativeAnr,
} from './native';
import { Resource } from '@opentelemetry/resources';
import { LOCATION_LATITUDE, LOCATION_LONGITUDE } from './constants';
import { instrumentErrors, reportError } from './errors';
import ReacNativeSpanExporter from './exporting';
import { getResource, setGlobalAttributes } from './globalAttributes';
import { _generatenewSessionId, getSessionId } from './session';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { instrumentXHR } from './xhr';

export interface ReactNativeConfiguration {
  target: string;
  accountKey: string;
  serviceName: string;
  projectName: string;
  sessionRecording?: boolean;
  deploymentEnvironment?: string;
  appStartEnabled?: boolean;
  enableDiskBuffering?: boolean;
  limitDiskUsageMegabytes?: number;
  truncationCheckpoint?: number;
  bufferTimeout?: number;
  bufferSize?: number;
  debug?: boolean;
  /** Sets attributes added to every Span. */
  globalAttributes?: Attributes;
  tracePropagationTargets?: Array<string | RegExp>;
  /**
   * URLs that partially match any regex in ignoreUrls will not be traced.
   * In addition, URLs that are _exact matches_ of strings in ignoreUrls will
   * also not be traced.
   */
  ignoreUrls?: Array<string | RegExp>;
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

const updateLocation = (latitude: number, longitude: number) => {
  setGlobalAttributes({
    [LOCATION_LATITUDE]: latitude,
    [LOCATION_LONGITUDE]: longitude,
  });
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

    const nativeSdkConf: NativeSdKConfiguration = {
      target: config.target,
      accountKey: config.accountKey,
      serviceName: config.serviceName,
      projectName: config.projectName,
      sessionRecording: String(config.sessionRecording || true),
      globalAttributes: {
        ...getResource(),
        [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
        'project.name': config.projectName,
        'session.id': getSessionId(),
        ...config.globalAttributes,
        'deployment.environment': config.deploymentEnvironment,
      },
    };

    setGlobalAttributes(nativeSdkConf.globalAttributes ?? {});

    const provider = new WebTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
        'project.name': config.projectName,
        ...getResource(),
      }),
    });
    provider.addSpanProcessor(new GlobalAttributeAppender());
    provider.addSpanProcessor(
      new BatchSpanProcessor(new ReacNativeSpanExporter())
    );

    provider.register({});
    this.provider = provider;
    const clientInitEnd = Date.now();

    instrumentXHR({ ignoreUrls: config.ignoreUrls });
    instrumentErrors();

    const nativeInit = Date.now();

    diag.debug(
      'Initializing with: ',
      nativeSdkConf.serviceName,
      nativeSdkConf.projectName,
      nativeSdkConf.target
    );

    initializeNativeSdk(nativeSdkConf).then((nativeAppStart) => {
      appStartInfo = nativeAppStart;
      appStartInfo.isColdStart = appStartInfo.isColdStart || true;
      appStartInfo.appStart = appStartInfo.appStart || appStartInfo.moduleStart;
      setNativeSessionId(getSessionId());

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
  info: info,
  error: error,
  debug: debug,
  warn: warn,
};
