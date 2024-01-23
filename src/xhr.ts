import { trace, type Attributes, diag } from '@opentelemetry/api';
import { isUrlIgnored } from '@opentelemetry/core';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { captureTraceParent } from './serverTiming';
import { COMPONENT } from './constants';

const ATTRIBUTE_PROP = '_middlewareXHRAttributes';

interface XhrConfig {
  ignoreUrls: Array<string | RegExp> | undefined;
}

export function instrumentXHR(config: XhrConfig) {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const tracer = trace.getTracer('xhr');

  interface InstrumentedXMLHttpRequest extends XMLHttpRequest {
    [ATTRIBUTE_PROP]: Attributes;
  }

  XMLHttpRequest.prototype.open = function (
    this: InstrumentedXMLHttpRequest,
    ...args
  ) {
    const attributes = {
      [SemanticAttributes.HTTP_METHOD]: args[0],
      [SemanticAttributes.HTTP_URL]: args[1],
      [COMPONENT]: 'http',
      'event.type': 'fetch',
    };
    diag.debug(`XHR url: ${args[1]}, ignoreUrls: ${config.ignoreUrls}`);
    if (isUrlIgnored(args[1], config.ignoreUrls)) {
      diag.debug('XHR: ignoring span as url matches ignored url');
    } else {
      this[ATTRIBUTE_PROP] = attributes;
    }

    originalOpen.apply(this, args);
  };

  XMLHttpRequest.prototype.send = function (
    this: InstrumentedXMLHttpRequest,
    ...args
  ) {
    const attrs = this[ATTRIBUTE_PROP];
    if (attrs) {
      const spanName = `HTTP ${(
        attrs[SemanticAttributes.HTTP_METHOD]! as string
      ).toUpperCase()}`;

      const span = tracer.startSpan(spanName, {
        attributes: attrs,
      });

      this.addEventListener('readystatechange', () => {
        if (this.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
          const headers = this.getAllResponseHeaders().toLowerCase();
          if (headers.indexOf('server-timing') !== -1) {
            const st = this.getResponseHeader('server-timing');
            if (st !== null) {
              captureTraceParent(st, span);
            }
          }
        }
        if (this.readyState === XMLHttpRequest.DONE) {
          span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, this.status);
          span.end();
        }
      });
    }
    originalSend.apply(this, args);
  };
}
