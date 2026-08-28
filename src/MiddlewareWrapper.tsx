import {
  UIManager,
  requireNativeComponent,
  type ViewProps,
} from 'react-native';
import { MiddlewareRum, type ReactNativeConfiguration } from './middlewareRum';

import React, { useEffect, type PropsWithChildren } from 'react';
import { LINKING_ERROR } from './native';
import { diag } from '@opentelemetry/api';

type Props = PropsWithChildren<{
  configuration: ReactNativeConfiguration;
}>;

let isInitialized = false;

export const MiddlewareWrapper: React.FC<Props> = ({
  children,
  configuration,
}) => {
  useEffect(() => {
    MiddlewareRum.finishAppStart();
  }, []);

  if (!isInitialized) {
    // Flip the flag first: if init throws, React re-renders and we must not
    // retry initialization on every render.
    isInitialized = true;
    try {
      MiddlewareRum.init(configuration);
    } catch (e: any) {
      // RUM must never take the host app's tree down with it.
      diag.error(`MiddlewareRum: init failed: ${e?.message ?? e}`);
    }
  }

  return <>{children}</>;
};

/**
 * Resolving the sanitized-view manager is best-effort: under the New
 * Architecture (bridgeless) `getViewManagerConfig` can log and return null,
 * or throw, for a legacy view manager. Either way the app must still boot —
 * only rendering `MiddlewareSanitizedView` should surface the problem.
 */
function resolveSanitizedView(): React.ComponentType<ViewProps> {
  try {
    if (UIManager.getViewManagerConfig('NativeSanitizedView') != null) {
      return requireNativeComponent<ViewProps>('NativeSanitizedView');
    }
  } catch (e: any) {
    diag.debug(
      `MiddlewareRum: NativeSanitizedView lookup failed: ${e?.message ?? e}`
    );
  }
  return () => {
    throw new Error('NativeSanitizedView; ' + LINKING_ERROR);
  };
}

const NativeSanitizedView = resolveSanitizedView();

export const MiddlewareSanitizedView = NativeSanitizedView;
