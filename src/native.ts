import { NativeModules, Platform } from 'react-native';
import type { Attributes } from '@opentelemetry/api';

const LINKING_ERROR =
  `The package 'middleware-react-native' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const MiddlewareReactNative = NativeModules.MiddlewareReactNative
  ? NativeModules.MiddlewareReactNative
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

export interface NativeSdKConfiguration {
  target: string;
  accountKey: string;
  globalAttributes?: object;
  serviceName: string;
  projectName: string;
  enableDiskBuffering?: boolean;
  limitDiskUsageMegabytes?: number;
  truncationCheckpoint?: number;
}

export type AppStartInfo = {
  appStart?: number;
  moduleStart: number;
  isColdStart?: boolean;
};

export const initializeNativeSdk = (
  config: NativeSdKConfiguration
): Promise<AppStartInfo> => {
  return MiddlewareReactNative.initialize(config);
};

export const exportSpansToNative = (spans: object[]): Promise<null> => {
  return MiddlewareReactNative.export(spans);
};

export const setNativeSessionId = (id: string): Promise<boolean> => {
  return MiddlewareReactNative.setSessionId(id);
};

export const setNativeGlobalAttributes = (
  attributes: Attributes
): Promise<boolean> => {
  return MiddlewareReactNative.setGlobalAttributes({ ...attributes });
};

export const testNativeCrash = () => {
  MiddlewareReactNative.nativeCrash();
};

export const info = (message: String) => {
  MiddlewareReactNative.info(message);
};

export const error = (message: String) => {
  MiddlewareReactNative.error(message);
};

export const warn = (message: String) => {
  MiddlewareReactNative.warn(message);
};

export const debug = (message: String) => {
  MiddlewareReactNative.debug(message);
};
