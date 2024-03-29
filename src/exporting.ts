import { diag } from '@opentelemetry/api';
import {
  ExportResultCode,
  type ExportResult,
  hrTimeToNanoseconds,
} from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { exportSpansToNative } from './native';

export default class ReacNativeSpanExporter implements SpanExporter {
  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    exportSpansToNative(spans.map(this.toNativeSpan));

    resultCallback({ code: ExportResultCode.SUCCESS });
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
    //FIXME this._sendSpans([]);
    return Promise.resolve();
  }
}
