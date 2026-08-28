import { diag } from '@opentelemetry/api';
import {
  ExportResultCode,
  type ExportResult,
  hrTimeToNanoseconds,
} from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { exportSpansToNative, isNativeSdkAvailable } from './native';
import OtlpHttpTraceExporter, {
  type OtlpExporterOptions,
} from './otlpTraceExporter';

/**
 * Hands spans to the native SDK, which owns the OTLP pipeline.
 *
 * When the native module isn't in the binary (Expo Go, a build made before
 * the package was added, autolinking miss) it falls back to posting OTLP
 * straight from JS so traces still reach Middleware. Previously this class
 * reported SUCCESS unconditionally and dropped the native promise, so a
 * broken native side looked exactly like a healthy one.
 */
export default class ReacNativeSpanExporter implements SpanExporter {
  private readonly fallback?: OtlpHttpTraceExporter;
  private loggedFallback = false;

  constructor(otlpOptions?: OtlpExporterOptions) {
    if (otlpOptions) {
      this.fallback = new OtlpHttpTraceExporter(otlpOptions);
    }
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    if (!isNativeSdkAvailable()) {
      if (this.fallback) {
        if (!this.loggedFallback) {
          this.loggedFallback = true;
          diag.warn(
            '[MiddlewareRum] native module unavailable — exporting spans ' +
              'directly over OTLP/HTTP from JS.'
          );
        }
        this.fallback.export(spans, resultCallback);
      } else {
        resultCallback({
          code: ExportResultCode.FAILED,
          error: new Error(
            'MiddlewareRum: native module unavailable and no OTLP fallback configured'
          ),
        });
      }
      return;
    }

    exportSpansToNative(spans.map(this.toNativeSpan)).then((handedOff) => {
      resultCallback(
        handedOff
          ? { code: ExportResultCode.SUCCESS }
          : {
              code: ExportResultCode.FAILED,
              error: new Error(
                'MiddlewareRum: native exporter rejected the span batch'
              ),
            }
      );
    });
  }

  toNativeSpan(span: ReadableSpan): object {
    const spanContext = span.spanContext();
    const events: any = [];
    span.events.forEach((event) =>
      events.push({
        name: event.name,
        time: hrTimeToNanoseconds(event.time).toString(),
        attributes: event.attributes,
        droppedAttributesCount: event.droppedAttributesCount,
      })
    );
    const nSpan = {
      name: span.name,
      kind: span.kind,
      startTime: hrTimeToNanoseconds(span.startTime),
      endTime: hrTimeToNanoseconds(span.endTime),
      parentSpanId: span.parentSpanId || '0000000000000000',
      attributes: span.attributes,
      resource: span.resource,
      events: events,
      duration: span.duration,
      ended: span.ended,
      links: span.links,
      instrumentationLibrary: span.instrumentationLibrary,
      droppedAttributesCount: span.droppedAttributesCount,
      droppedEventsCount: span.droppedEventsCount,
      droppedLinksCount: span.droppedLinksCount,
      status: span.status,
      ...spanContext,
    };
    diag.debug('Exporting:toNativeSpan: ', nSpan.name, span.duration);
    diag.debug('Exporting: span: ', nSpan);
    return nSpan;
  }

  /**
   * Shutdown the exporter.
   */
  shutdown(): Promise<void> {
    return this.fallback?.shutdown() ?? Promise.resolve();
  }
}
