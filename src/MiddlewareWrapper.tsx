import {
  Platform,
  UIManager,
  View,
  requireNativeComponent,
  type ViewProps,
} from 'react-native';
import { MiddlewareRum, type ReactNativeConfiguration } from './middlewareRum';

import React, { useEffect, type PropsWithChildren } from 'react';
import { LINKING_ERROR } from './native';

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
    MiddlewareRum.init(configuration);
    isInitialized = true;
  } else {
    MiddlewareRum.info('Middleware Already Initialized');
    console.log('Already initialized');
  }

  return <>{children}</>;
};
const NativeSanitizedView =
  UIManager.getViewManagerConfig('NativeSanitizedView') != null
    ? requireNativeComponent<ViewProps>('NativeSanitizedView')
    : () => {
        throw new Error('NativeSanitizedView; ' + LINKING_ERROR);
      };

export const MiddlewareSanitizedView =
  Platform.OS === 'ios' ? NativeSanitizedView : View;
