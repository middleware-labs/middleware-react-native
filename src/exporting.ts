import { diag } from '@opentelemetry/api';
import {
  ExportResultCode,
  hrTimeToMilliseconds,
  type ExportResult,
} from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { exportSpansToNative } from './native';
import { toZipkinSpan } from './zipkintransform';
export default class ReacNativeSpanExporter implements SpanExporter {
  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    //FIXME unify this so ios and android are the same

    exportSpansToNative(spans.map(this.toNativeSpan));

    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  toZipkin(span: ReadableSpan) {
    const zipkinSpan = toZipkinSpan(span, 'servicenamegoeshere');
    diag.debug(
      'Exporting:zipkinTonativeSpan',
      zipkinSpan.name,
      zipkinSpan.duration / 1e6
    );
    return zipkinSpan;
  }

  toNativeSpan(span: ReadableSpan): object {
    const spanContext = span.spanContext();
    const nSpan = {
      name: span.name,
      kind: span.kind,
      startTime: hrTimeToMilliseconds(span.startTime),
      endTime: hrTimeToMilliseconds(span.endTime),
      parentSpanId: span.parentSpanId || '0000000000000000',
      attributes: span.attributes,
      events: JSON.stringify(span.events),
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
    //FIXME this._sendSpans([]);
    return Promise.resolve();
  }
}
