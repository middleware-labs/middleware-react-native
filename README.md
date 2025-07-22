# Middleware React Native SDK

Middleware React Native Real User Monitoring SDK

---
<p align="center">
  <a href="https://github.com/middleware-labs/middleware-react-native/releases">
    <img alt="Build Status" src="https://img.shields.io/badge/status-beta-orange">
  </a>
   <img alt="NPM Version" src="https://img.shields.io/npm/v/%40middleware.io%2Fmiddleware-react-native?color=green&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40middleware.io%2Fmiddleware-react-native">
  <a href="https://github.com/middleware-labs/middleware-react-native/releases">
    <img alt="GitHub release (latest SemVer)" src="https://img.shields.io/github/v/release/middleware-labs/middleware-react-native?include_prereleases&style=flat">
  </a>
  <a href="https://github.com/middleware-labs/middleware-react-native/actions/workflows/build.yml">
    <img alt="Build Status" src="https://img.shields.io/github/actions/workflow/status/middleware-labs/middleware-react-native/ci.yml?branch=main&style=flat">
  </a>
</p>

---

## Features

- AutoInstrumentation HTTP Monitoring
- AutoInstrumentaion JS Errors
- AutoInstrumenation navigation tracking for `react-navigation`
- AutoInstrumenation native crash errors
- Custom Instrumenation using OpenTelemetry
- Custom logging
- RUM Session Tracking
- Session Recording

## Documentation


### Compatibility & Requirements

Middleware React Native for Mobile supports React Native 0.68 and higher.

The library is also compatible with the following frameworks and libraries:

- Expo framework
- React Navigation 5 and 6

### Installation

```sh
yarn add @middleware.io/middleware-react-native
```

### Usage

```js
import { MiddlewareWrapper, type ReactNativeConfiguration } from '@middleware.io/middleware-react-native';
        
const MiddlewareConfig: ReactNativeConfiguration = {
    serviceName: 'Mobile-SDK-ReactNative',
    projectName: '$Mobile-SDK-ReactNative',
    accountKey: '<middleware-account-key>',
    target: '<target-url>',
    deploymentEnvironment: 'PROD',
    globalAttributes: {
        name: '<your-name>',
    },
};

export default function App() { 
    return (
      <MiddlewareWrapper configuration={MiddlewareConfig}>
        // Application Components
      </MiddlewareWrapper>
    );
  }
```

### Custom logging

You can add custom logs such as debug, error, warn, info these logs will be shown on Middleware Logs Dashboard

```typescript
MiddlewareRum.debug("I am debug");
MiddlewareRum.error("I am error");
MiddlewareRum.info("I am info");
MiddlewareRum.warn("I am warn");
```

### Setting Global Attributes
You can set global attributes by calling `setGlobalAttributes` function.

```typescript
MiddlewareRum.setGlobalAttributes({
    "name": "Middleware",
    "app.version": "1.0.0",
    "custom_key": "some value"
});
```

### Network instrumentation

To ignore capturing urls pass `Array<String | RegExp>` in `ignoreUrls` key in `ReactNativeConfiguration`

Example: 
```typescript
  ignoreUrls: [/^\/api\/facts/, /^\/api\/v1\/users\/.*/],
```

> Note: By default SDK captures following `Content-type`
> - `application/json`
> - `application/text`
> - `text/x-component`
 


To redact network headers `Set<String>` in `ignoreHeaders` key in `ReactNativeConfiguration`

Example: 
```typescript
ignoreHeaders: new Set(['x-ignored-header']),
```

_Note: By default `x-access-token` will be readacted._

To disable network instrumentation set `networkInstrumentation: false`

```typescript
const MiddlewareConfig: ReactNativeConfiguration = {
    ...
    networkInstrumentation: false
};
```

### Reporting custom errors

You can report handled errors, exceptions, and messages using the `reportError` function

```typescript
try{
    throw new Error("I am error")
} catch (err) {
    MiddlewareRum.reportError(err);
}
```

### Updating location information

You can set latitude & longitde as global attributes.

```typescript
MiddlewareRum.updateLocation(latitude: number, longitude: number)
```

### Enable session recording

By default session recording is enabled, to disable session recording pass `sessionRecording: false` configuration as follows - 

```js
const MiddlewareConfig: ReactNativeConfiguration = {
    serviceName: 'Mobile-SDK-ReactNative',
    projectName: '$Mobile-SDK-ReactNative',
    accountKey: '<middleware-account-key>',
    target: '<target-url>',
    sessionRecording: false,
    deploymentEnvironment: 'PROD',
    globalAttributes: {
        name: '<your-name>',
    },
};
```

#### Sanitizing views in session recording

Views will get blurred hiding sensitive information in session recording.

```js
<MiddlewareSanitizedView>
  <Component/>
</MiddlewareSanitizedView>
```

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

Apache 2.0
