import { MiddlewareRum, type ReactNativeConfiguration } from './middlewareRum';

import React, { useEffect, type PropsWithChildren } from 'react';

type Props = PropsWithChildren<{
  configuration: ReactNativeConfiguration;
}>;

let isInitialized = false;

export const MiddlewareWrapper: React.FC<Props> = ({
  children,
  configuration,
}) => {
  useEffect(() => {}, []);

  if (!isInitialized) {
    MiddlewareRum.init(configuration);
    isInitialized = true;
  } else {
    console.log('Already initialized');
  }

  return <>{children}</>;
};
