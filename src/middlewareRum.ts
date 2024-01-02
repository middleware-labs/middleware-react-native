import {
  trace,
  context,
  type Span,
  type Attributes,
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
} from '@opentelemetry/api';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { _globalThis } from '@opentelemetry/core';
import {
  initializeNativeSdk,
  type NativeSdKConfiguration,
  setNativeSessionId,
  testNativeCrash,
  type AppStartInfo,
} from './native';
import GlobalAttributeAppender from './globalAttributeAppender';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from 'instrumentation-document-load';
import { XMLHttpRequestInstrumentation } from 'middleware.io-instrumentation-xml-http-request';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { instrumentErrors, reportError } from './errors';
import {
  getGlobalAttributes,
  getResource,
  setGlobalAttributes,
} from './globalAttributes';
import { LOCATION_LATITUDE, LOCATION_LONGITUDE } from './constants';
import { getSessionId, _generatenewSessionId } from './session';
import { Platform } from 'react-native';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { Resource } from '@opentelemetry/resources';
import { B3Propagator } from '@opentelemetry/propagator-b3';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';

export interface ReactNativeConfiguration {
  target: string;
  accountKey: string;
  serviceName: string;
  projectName: string;
  deploymentEnvironment?: string;
  appStartEnabled?: boolean;
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
  reportError: (err: any, isFatal?: boolean) => void;
  setGlobalAttributes: (attributes: Attributes) => void;
  updateLocation: (latitude: number, longitude: number) => void;
}

const DEFAULT_CONFIG = {
  appStartEnabled: true,
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
      diag.debug('AppStart: end called without start');
    }
  },
  init(configugration: ReactNativeConfiguration) {
    const config = {
      ...DEFAULT_CONFIG,
      ...configugration,
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
      globalAttributes: { ...getResource() },
    };

    addGlobalAttributesFromConf(config);

    const provider = new WebTracerProvider({
      resource: new Resource({
        ...getResource(),
      }),
    });
    trace.setGlobalTracerProvider(provider);
    provider.register({
      propagator: new B3Propagator(),
    });
    provider.addSpanProcessor(new GlobalAttributeAppender());
    provider.addSpanProcessor(
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: `${config.target}/v1/traces`,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Headers': '*',
          },
          concurrencyLimit: 10,
          timeoutMillis: 10000,
        })
      )
    );

    provider.register({});
    const collectorOptions = {
      url: `${config.target}/v1/metrics`,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Headers': '*',
      },
      concurrencyLimit: 1,
    };
    const metricExporter = new OTLPMetricExporter(collectorOptions);
    let meterProvider = new MeterProvider({
      resource: new Resource({
        ...getResource(),
      }),
    });

    meterProvider.addMetricReader(
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 20000,
      })
    );
    this.provider = provider;
    const clientInitEnd = Date.now();

    registerInstrumentations({
      instrumentations: [
        new DocumentLoadInstrumentation(),
        new XMLHttpRequestInstrumentation({
          enabled: false,
          ignoreUrls: config.ignoreUrls,
          propagateTraceHeaderCorsUrls: config.tracePropagationTargets,
        }),
        new FetchInstrumentation({
          enabled: false,
          ignoreUrls: config.ignoreUrls,
          propagateTraceHeaderCorsUrls: config.tracePropagationTargets,
          clearTimingResources: true,
        }),
      ],
    });
    instrumentErrors();

    const nativeInit = Date.now();

    diag.debug(
      'Initializing with: ',
      nativeSdkConf.serviceName,
      nativeSdkConf.projectName,
      nativeSdkConf.target
    );

    let userStatusMetric = meterProvider
      .getMeter('mw-counter')
      .createCounter('user.status', {
        description: 'User Status ',
        unit: '',
        valueType: 1,
      });
    userStatusMetric.add(1, getGlobalAttributes());

    initializeNativeSdk(nativeSdkConf).then((nativeAppStart) => {
      appStartInfo = nativeAppStart;
      if (Platform.OS === 'ios') {
        appStartInfo.isColdStart = appStartInfo.isColdStart || true;
        appStartInfo.appStart =
          appStartInfo.appStart || appStartInfo.moduleStart;
      }
      setNativeSessionId(getSessionId());
      setGlobalAttributes({});
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
          this.appStartSpan.end(this.appStartEnd);
        }
      }
    });
    isInitialized = true;
    return this;
  },
  _generatenewSessionId: _generatenewSessionId,
  _testNativeCrash: testNativeCrash,
  reportError: reportError,
  setGlobalAttributes: setGlobalAttributes,
  updateLocation: updateLocation,
};

const addGlobalAttributesFromConf = (config: ReactNativeConfiguration) => {
  const confAttributes: Attributes = {
    ...config.globalAttributes,
  };
  confAttributes.app = config.projectName;

  if (config.deploymentEnvironment) {
    confAttributes[SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT] =
      config.deploymentEnvironment;
  }

  setGlobalAttributes(confAttributes);
};
