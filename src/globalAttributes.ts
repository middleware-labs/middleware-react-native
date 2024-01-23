import { Platform } from 'react-native';
import type { Attributes } from '@opentelemetry/api';
import type { ResourceAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { getSessionId } from './session';
import { setNativeGlobalAttributes } from './native';
import { version } from '../package.json';

import { SCREEN_NAME } from './constants';

let globalAttributes: Attributes = {};

const platformConstants = (Platform as any).constants;

// just for future where there may be a way to use proper resource
export function getResource(): ResourceAttributes {
  let resourceAttrs = {
    [SCREEN_NAME]: 'unknown',
    [SemanticResourceAttributes.TELEMETRY_SDK_NAME]:
      '@middleware-labs/middlware-react-native',
    [SemanticResourceAttributes.TELEMETRY_SDK_VERSION]: version,
    'middleware.rumVersion': version,
    'browser.trace': 'true',
    'browser.mobile': 'true',
  };

  if (Platform.OS === 'ios') {
    resourceAttrs[SemanticResourceAttributes.OS_NAME] = 'iOS';
    resourceAttrs[SemanticResourceAttributes.OS_VERSION] =
      platformConstants.osVersion;
  } else {
    resourceAttrs[SemanticResourceAttributes.OS_NAME] = 'Android';
    resourceAttrs[SemanticResourceAttributes.OS_TYPE] = 'linux';
    resourceAttrs[SemanticResourceAttributes.OS_VERSION] =
      platformConstants.Release;
    resourceAttrs[SemanticResourceAttributes.DEVICE_MODEL_NAME] =
      platformConstants.Model;
    resourceAttrs[SemanticResourceAttributes.DEVICE_MODEL_IDENTIFIER] =
      platformConstants.Model;
  }

  return resourceAttrs;
}

globalAttributes = {
  ...getResource(),
};

export const setGlobalAttributes = (attrs: object) => {
  globalAttributes = Object.assign(globalAttributes, attrs);
  setNativeGlobalAttributes(globalAttributes);
};

export function getGlobalAttributes(): Attributes {
  return Object.assign(globalAttributes, {
    'session.id': getSessionId(),
  });
}
