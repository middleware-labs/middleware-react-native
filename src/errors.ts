import { SpanStatusCode, trace } from '@opentelemetry/api';

const STACK_LIMIT = 4096;
const MESSAGE_LIMIT = 1024;

export const instrumentErrors = () => {
  ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    reportError(error, isFatal);
  });
};

export const reportError = (error: any, isFatal?: boolean) => {
  const tracer = trace.getTracer('error');
  const msg = error.message || error.toString();

  const attributes = {
    'error.isFatal': isFatal,
    'error.message': limitLen(msg, MESSAGE_LIMIT),
    'error.name': useful(error.name)
      ? error.name
      : error.constructor && error.constructor.name
      ? error.constructor.name
      : 'Error',
    'exception': true, //TODO do we use this?
    'component': 'error',
    'event.type': 'error',
    'type': 'reactNativeError',
  };

  if (error.stack && useful(error.stack)) {
    (attributes as any)['error.stack'] = limitLen(
      error.stack.toString(),
      STACK_LIMIT
    );
  }

  const errorSpan = tracer.startSpan(attributes['error.message'], {
    attributes,
  });
  if (error.stack && useful(error.stack)) {
    const limitStack = limitLen(error.stack.toString(), STACK_LIMIT);
    errorSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: limitStack,
    });
    errorSpan.recordException({
      code: SpanStatusCode.ERROR,
      message: limitLen(msg, MESSAGE_LIMIT),
      name: useful(error.name)
        ? error.name
        : error.constructor && error.constructor.name
        ? error.constructor.name
        : 'Error',
      stack: limitStack,
    });
  }
  errorSpan.end();
};

const limitLen = (s: string, cap: number): string => {
  if (s.length > cap) {
    return s.substring(0, cap);
  } else {
    return s;
  }
};

const useful = (s: any) => {
  return s && s.trim() !== '' && !s.startsWith('[object') && s !== 'error';
};
