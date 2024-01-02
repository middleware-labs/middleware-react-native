import { trace } from '@opentelemetry/api';

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
    'exception.isFatal': isFatal,
    'exception.message': limitLen(msg, MESSAGE_LIMIT),
    'exception.object': useful(error.name)
      ? error.name
      : error.constructor && error.constructor.name
      ? error.constructor.name
      : 'Error',
    'exception': true, //TODO do we use this?
    'component': 'error',
  };

  if (error.stack && useful(error.stack)) {
    (attributes as any)['exception.stacktrace'] = limitLen(
      error.stack.toString(),
      STACK_LIMIT
    );
  }
  tracer.startSpan('error', { attributes }).end();
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
