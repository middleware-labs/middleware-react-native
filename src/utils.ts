const MASK_VALUE = '********';

import type { Span } from '@opentelemetry/api';
import stringifySafe from 'json-stringify-safe';

export function headerCapture<T extends Record<string, string | string[]>>(
  type: string,
  headers: Array<keyof T>,
  ignoreHeaders: Set<string> | undefined = new Set()
): (
  span: Span,
  getHeader: (header: keyof T) => string | string[] | undefined
) => void {
  const normalizedHeaders = new Map<string, string>(
    headers.map((header) => [
      (header as string).toLowerCase(),
      (header as string).toLowerCase().replace(/-/g, '_'),
    ])
  );

  return (span, getHeader) => {
    for (const [capturedHeader, normalizedHeader] of normalizedHeaders) {
      let value = getHeader(capturedHeader as keyof T);

      if (value === undefined || ignoreHeaders.has(capturedHeader)) {
        continue;
      }

      if (capturedHeader === 'x-access-token') {
        value = MASK_VALUE;
      }

      const key = `http.${type}.header.${normalizedHeader}`;

      if (typeof value === 'string') {
        span.setAttribute(key, [value].toString());
      } else if (Array.isArray(value)) {
        span.setAttribute(key, value.toString());
      } else {
        span.setAttribute(key, [value].toString());
      }
    }
  };
}
export const jsonToString = (json: any) => {
  let output = '';
  let error = false;
  try {
    output = JSON.stringify(json);
  } catch (ex) {
    error = true;
    // ignore error
  }

  if (error) {
    try {
      output = stringifySafe(json);
    } catch (ex) {
      // ignore error
    }
  }

  return output;
};
