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

Since v2.0.0 the SDK wraps the stable Middleware native SDKs
(`io.github.middleware-labs:android-sdk` 3.0.2+ and the `MiddlewareRum`
CocoaPod 2.1+), which brings v3 session recording (rrweb replay), native
crash/ANR reporting, and screen-name linked replays. Native toolchain
requirements:

- **Android**: `compileSdkVersion` 35+, Kotlin Gradle Plugin **2.0.21+**
  (pin `classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21")` on
  React Native < 0.77), `minSdkVersion` 21. If your app still enables
  Jetifier, add `android.jetifier.ignorelist=jackson-core` to
  `gradle.properties`.
- **iOS**: deployment target **13.0+**, CocoaPods (the `MiddlewareRum` pod
  is pulled automatically). When building pods as static libraries (the
  default), add `pod 'Reachability', :modular_headers => true` to your
  Podfile.

The library is also compatible with the following frameworks and libraries:

- Expo (SDK 52+, via a development build — see below)
- React Navigation 5, 6 and 7

### Installation

```sh
yarn add @middleware.io/middleware-react-native
```

### Expo

This SDK contains custom native code, so **it cannot run in Expo Go** — Expo Go
ships a fixed native binary and has no way to load the Middleware native SDKs.
You need a [development build](https://docs.expo.dev/develop/development-builds/introduction/).

Add the config plugin to `app.json` / `app.config.js`:

```json
{
  "expo": {
    "plugins": ["@middleware.io/middleware-react-native"]
  }
}
```

Then create a development build:

```sh
npx expo prebuild --clean     # regenerate ios/ and android/ with the plugin applied
npx expo run:android          # or: npx expo run:ios
```

For EAS, `eas build --profile development` picks the plugin up automatically.

The plugin applies the native requirements that a managed project can't set on
its own:

| Change | Why |
| --- | --- |
| `android.jetifier.ignorelist=jackson-core` | Jetifier fails on the `jackson-core` inside `android-sdk` 3.x |
| Kotlin Gradle Plugin >= 2.0.21 | `android-sdk` 3.x is compiled with Kotlin 2.0.21 metadata |
| `compileSdkVersion` >= 35 | required by `android-sdk` 3.x (an already-higher value is left alone) |
| iOS deployment target >= 13.0 | minimum for the `MiddlewareRum` pod |
| `pod 'Reachability', :modular_headers => true` | Reachability ships no modulemap, so Swift can't import it under static libraries (skipped when the app uses `use_frameworks!`) |

Options, if you need to override a default:

```json
{
  "expo": {
    "plugins": [
      ["@middleware.io/middleware-react-native", {
        "kotlinVersion": "2.0.21",
        "compileSdkVersion": 35,
        "iosDeploymentTarget": "13.0",
        "jetifierIgnorelist": true,
        "reachabilityModularHeaders": true
      }]
    ]
  }
}
```

#### Checking that the native SDK is actually linked

If spans stop flowing, the first thing to check is whether the native module
made it into the binary:

```typescript
import { MiddlewareRum } from '@middleware.io/middleware-react-native';

console.log('Middleware native linked:', MiddlewareRum.isNativeAvailable());
```

`false` means you are on Expo Go, or running a binary built before the package
was added — rebuild with `npx expo run:android` / `run:ios`.

The SDK falls back to sending traces from JS over OTLP/HTTP in two cases: the
native module isn't linked, or native initialization failed. Either way
**traces still reach Middleware**, while crash/ANR reporting and session
recording stay off until the native side is healthy. Native failures are
logged with their cause, for example:

```
ERROR [MiddlewareRum] native initialize failed: Method addObserver must be called on the main thread
```

Set `debug: true` in your configuration to also see per-export detail.

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

### Distributed Tracing

End-to-end tracing links a RUM session to the backend traces it caused, so you can open a slow
screen in the session explorer and see the server spans behind it.

It works by trace-context propagation: the SDK creates a client span for each outgoing request and
injects the W3C `traceparent` header. Your instrumented backend continues that same trace, and
Middleware correlates the two by trace ID.

**This is on by default and requires no code.** Every request made through `fetch` or
`XMLHttpRequest` is traced and carries trace headers.

To keep your trace IDs off third-party APIs, narrow propagation to your own domains with
`tracePropagationTargets`, which takes `Array<string | RegExp>`:

```typescript
const MiddlewareConfig: ReactNativeConfiguration = {
    ...
    tracePropagationTargets: [/api.example.com/, /anotherapi.example.com/]
};
```

Requests to other hosts are still timed and still appear in the session — they just travel
without trace headers. An explicit empty array disables propagation entirely.

Prefer regexes: a `RegExp` entry is matched against the URL, but a plain `string` entry has to
equal the whole URL exactly, so `'api.example.com'` matches nothing.

By default both W3C (`traceparent`) and B3 headers are sent. Use `tracePropagationFormat: 'w3c'`
or `'b3'` to send only one.


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

#### Recording options

Tune how the recording is captured with `recordingOptions`:

```js
const MiddlewareConfig: ReactNativeConfiguration = {
    // ...
    sessionRecording: true,
    recordingOptions: {
        frequency: 'standard',   // 'low' (~1 fps, default) | 'standard' | 'high'
        quality: 'standard',     // 'low' | 'standard' (default) | 'high'
        maskAllTextInputs: true, // default true
        maskAllImages: true,     // default true
    },
    // Fraction of sessions that get recorded (0.0 - 1.0). Defaults to 1.0.
    sessionSamplingRatio: 1.0,
    // Fall back to the legacy (v2) screenshot recorder. v3 (rrweb replay) is the default.
    disableSessionRecordingV3: false,
};
```

#### Starting and stopping recording at runtime

Recording can be controlled after initialization — useful when you only want to
record a specific flow:

```js
import { MiddlewareRum } from '@middleware.io/middleware-react-native';

await MiddlewareRum.startRecording(); // -> boolean: recording is running
await MiddlewareRum.stopRecording();  // -> boolean: recording was stopped
await MiddlewareRum.isRecording();    // -> boolean
```

Both calls are **sticky**: they survive session rotation and override the session
sampler, so recording stays in the state you asked for until you change it again.

`startRecording()` also overrides `sessionRecording: false`, which lets you keep
recording off by default and turn it on only where you need it:

```js
MiddlewareRum.init({ ...config, sessionRecording: false });

// later, e.g. when the user enters the checkout flow
await MiddlewareRum.startRecording();
// ...
await MiddlewareRum.stopRecording();
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
