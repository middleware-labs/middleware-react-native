# Changelog

All notable changes to the Middleware React Native SDK (`@middleware.io/middleware-react-native`) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!--
Maintaining this file:
- Every PR that changes SDK behavior adds a bullet under [Unreleased], in the
  right category (Added, Changed, Deprecated, Removed, Fixed, Security).
  Write it for app developers: what changes for them, not how it was done.
- To release: python3 scripts/changelog.py release <version>
  (moves [Unreleased] into a dated section; the release workflow refuses to
  publish a version that has no section and uses it as the GitHub release notes).
-->

## [Unreleased]

## [2.3.1] - 2026-10-28

### Fixed

- Bumped Android `io.github.middleware-labs:android-sdk` 3.2.0 → 3.2.2. Every
  Android launch used to create a second session next to the real one,
  holding only a native `AppStart` and a `Paused` span and no replay. 3.2.2
  no longer starts otel-android's activity lifecycle instrumentation when
  lifecycle monitoring is disabled (which this SDK always does), so the extra
  session is gone.

## [2.3.0] - 2026-10-13

### Added

- `captureNetworkHeaders` config option (default `false`): records request and
  response headers on fetch/XHR spans as `http.request.header.<name>` /
  `http.response.header.<name>` (lowercase, `-` → `_`, `x-access-token`
  masked). Linking a span to your backend trace from a
  `Server-Timing: traceparent` response header also requires this option now.
- `captureResponseBodies` config option (default `false`): records
  `http.response.body` for `application/json`, `*+json` (for example
  `application/problem+json`) and `text/plain` responses, truncated to 64 KiB.
- `ignoreHeaders` now accepts an array as well as a `Set`, and is matched
  case-insensitively.

### Changed

- **Breaking:** headers and bodies are no longer captured by default. Up to
  2.1.9 every fetch/XHR span recorded request headers, response headers,
  request bodies and response bodies. Set `captureNetworkHeaders` and/or
  `captureResponseBodies` to keep capturing headers or response bodies.
  Request bodies (`http.request.body`) are never recorded any more, and
  `text/x-component` responses are no longer captured.
- **Breaking:** session replay masking now defaults to off, matching the
  browser SDK: `recordingOptions.maskAllTextInputs` and
  `recordingOptions.maskAllImages` default to `false` (they were `true`), so
  screens are recorded as-is and only password/sensitive inputs are masked.
  Set both to `true` to keep the previous behavior. This comes from the
  native SDK bumps below.
- Requires the native SDKs with the same capture options: Android
  `io.github.middleware-labs:android-sdk` 3.1.6 → 3.2.0, iOS `MiddlewareRum`
  `~> 2.2.4` → `~> 2.3.0`. On Android the three capture options are also
  passed to the native SDK, where they apply to requests traced through its
  OkHttp call factory.
- iOS: native URLSession tracing is turned off. It also saw React Native's
  own fetch/XHR traffic, so every request produced a second, native span;
  each request now produces one span. Requests made directly by native code
  (native modules, third-party native SDKs, `<Image>` loads) are no longer
  traced on iOS.
- Navigation spans from `startNavigationTracking` are now named after the
  route (were all named `Created`), use `event.type=screen_view` (was
  `app_activity`), and carry `screen.name`. A `state` event that only changes
  route params no longer emits a screen span.

## [2.1.9] - 2026-09-23

### Fixed

- Android: session recording now captures from the first screen. The
  recorder was started after the host Activity had already resumed, so it
  captured nothing until the app was backgrounded and reopened.
- Bumped Android `io.github.middleware-labs:android-sdk` 3.1.5 → 3.1.6, which
  includes a session recording fix.

## [2.1.8] - 2026-09-18

### Changed

- **Breaking:** fetch/XHR spans use the current OpenTelemetry HTTP semantic
  conventions: `url.full`, `http.request.method`, `http.response.status_code`
  and `server.address` replace `http.url`, `http.method` and
  `http.status_code`. Update dashboards, alerts and queries that read the old
  keys.
- Bumped Android `io.github.middleware-labs:android-sdk` 3.1.4 → 3.1.5
  (removes duplicate HTTP attributes) and iOS `MiddlewareRum` `~> 2.2.3` →
  `~> 2.2.4` (attributes updated to current OTel conventions).

### Fixed

- Android: `http.response.status_code` and `server.port` are exported as
  integers instead of doubles (a status of `200` used to arrive as `200.0`).

## [2.1.7] - 2026-09-10

### Fixed

- Bumped iOS `MiddlewareRum` `~> 2.2.2` → `~> 2.2.3`, which fixes the
  authorization header on exported logs.

## [2.1.6] - 2026-09-04

### Changed

- Bumped Android `io.github.middleware-labs:android-sdk` 3.1.2 → 3.1.4 and iOS
  `MiddlewareRum` `~> 2.2` → `~> 2.2.2`. Both remove the legacy (v2)
  screenshot recorder; session recording always uses the v3 (rrweb replay)
  recorder.

### Removed

- **Breaking:** the `disableSessionRecordingV3` config option (fallback to the
  legacy v2 recorder) is removed, and spans no longer carry the
  `recordingV3` resource attribute. Remove the option from your
  configuration; TypeScript builds that still set it will fail.

## [2.1.5] - 2026-09-02

### Changed

- `tracePropagationTargets` now defaults to every URL, matching the browser
  and native SDKs. Previously, leaving it unset meant no request carried
  `traceparent`. Narrow it (regexes recommended, for example
  `[/api\.example\.com/]`) to keep trace ids off third-party hosts; an
  explicit empty array disables propagation. A `string` entry must equal the
  whole URL.

### Fixed

- `networkInstrumentation: false` now disables fetch/XHR instrumentation, as
  documented. Before, the flag was inverted: `false` left it on and `true`
  turned it off. Leaving it unset keeps instrumentation on.

## [2.1.4] - 2026-08-31

### Changed

- Bumped Android `io.github.middleware-labs:android-sdk` 3.1.0 → 3.1.2.

## [2.1.3] - 2026-08-31

### Fixed

- The `AppStart` span is never backdated before the session it belongs to.
  When the native process outlived its JS context, the span started at the
  old process start time, which made a short session look as long as the
  process had been alive. Such starts are now reported at the session start
  as warm starts.
- `AppStart` `start.type` reflects what the native SDK reports instead of
  always `cold`.

## [2.1.2] - 2026-08-28

### Fixed

- Native SDK initialization runs on the main thread on Android and iOS. It
  used to fail with "Method addObserver must be called on the main thread",
  after which every span export was rejected. If native initialization still
  fails, spans now fall back to the JS OTLP/HTTP exporter instead of being
  dropped.
- iOS: `startRecording()`, `stopRecording()` and `isRecording()` no longer
  risk a deadlock under the New Architecture (bridgeless).

## [2.1.1] - 2026-08-28

### Added

- Expo support through a config plugin: add
  `"plugins": ["@middleware.io/middleware-react-native"]` to `app.json` and
  create a development build (`npx expo prebuild`, `npx expo run:android` /
  `run:ios`, or EAS). During prebuild it adds
  `android.jetifier.ignorelist=jackson-core`, raises the Kotlin Gradle Plugin
  to 2.0.21+, raises an explicitly pinned `compileSdkVersion` to 35+, sets
  the iOS deployment target to 13.0+, and adds
  `pod 'Reachability', :modular_headers => true` for static-library pod
  builds. Override with the plugin options `kotlinVersion`,
  `compileSdkVersion`, `iosDeploymentTarget`, `jetifierIgnorelist` and
  `reachabilityModularHeaders`.
- `MiddlewareRum.isNativeAvailable()` reports whether the native module is
  linked into the running binary.
- When the native module is missing (Expo Go, a binary built before the
  package was added, an autolinking miss), traces are exported directly from
  JS over OTLP/HTTP to `{target}/v1/traces`. Crash/ANR reporting and session
  recording stay off in that mode.

### Fixed

- A missing native module no longer crashes the app. Every native call used
  to throw, and the first one ran inside `MiddlewareRum.init()` during
  render, taking down the whole React tree.
- An exception in `MiddlewareRum.init()` no longer takes down the app;
  `MiddlewareWrapper` logs it and renders its children.
- `MiddlewareSanitizedView` no longer throws at import under the New
  Architecture (bridgeless) when the view manager lookup fails.
- `pod install` works on React Native 0.75+ (Expo SDK 52+). It failed with
  "Unable to find a specification for `React-Codegen`"; the podspec now uses
  `install_modules_dependencies`.
- Span exports that fail on the native side are reported as failures instead
  of always succeeding.
- `MiddlewareWrapper` no longer sends a "Middleware Already Initialized" info
  log on every re-render.

## [2.1.0] - 2026-07-31

### Added

- `MiddlewareRum.startRecording()`, `stopRecording()` and `isRecording()`
  (each returns a `Promise<boolean>`) to control session recording at
  runtime. `startRecording()` overrides both `sessionRecording: false` and
  the session sampler. Both are sticky across session rotations until the
  other is called. Spans carry the live `recording` resource attribute.

### Changed

- Requires Android `io.github.middleware-labs:android-sdk` 3.1.0 (was 3.0.2)
  and iOS `MiddlewareRum` `~> 2.2` (was `~> 2.1`), which add the recording
  APIs.

### Fixed

- iOS: session recording starts reliably; `MiddlewareRum` 2.2 fixes
  starting the recorder.

## [2.0.2] - 2026-07-28

### Added

- `recordingOptions` config: `frequency` (`'low'` (default), `'standard'`,
  `'high'`), `quality` (`'low'`, `'standard'`, `'high'`), `maskAllTextInputs`
  and `maskAllImages`.
- `sessionSamplingRatio` config (0.0–1.0): the fraction of sessions sampled
  for traces and recordings.
- `MiddlewareRum.getSessionId()` returns the current session id.
- Screen names from `startNavigationTracking` are passed to the native SDKs,
  so session replays and native spans show the JS route name instead of the
  host Activity/ViewController class.

### Changed

- **Breaking:** the SDK now wraps the stable Middleware native SDKs, Android
  `io.github.middleware-labs:android-sdk` 3.0.2 (was 2.0.18-rn) and iOS
  `MiddlewareRum` `~> 2.1` (replacing the SDK's bundled iOS implementation
  and its direct DeviceKit, PLCrashReporter, SwiftProtobuf and SWCompression
  pods). This brings v3 session recording (rrweb replay). New build
  requirements:
  - Android: `compileSdkVersion` 35+, Kotlin Gradle Plugin 2.0.21+ (pin it on
    React Native < 0.77), `minSdkVersion` 21. If the app enables Jetifier,
    add `android.jetifier.ignorelist=jackson-core` to `gradle.properties`.
  - iOS: deployment target 13.0+ (was 11.0). When pods build as static
    libraries, add `pod 'Reachability', :modular_headers => true` to the
    Podfile.
- Session inactivity timeout raised from 5 to 15 minutes.
- The JS session is handed to the native SDKs before they start, so native
  crash, network and recording data land in the same session instead of a
  separate native one.
- iOS: `MiddlewareSanitizedView` content is masked in v3 replays as well.

### Deprecated

- `enableDiskBuffering`, `limitDiskUsageMegabytes`, `truncationCheckpoint`,
  `bufferTimeout` and `bufferSize`. They were never applied and will be
  removed.

## [1.0.25] - 2026-03-30

### Fixed

- The `recording` resource attribute is `1` when session recording is on by
  default. It used to be `0` unless `sessionRecording: true` was set
  explicitly.

## [1.0.24] - 2026-03-27

### Changed

- Spans carry `app.version` as a resource attribute, taken from the app's
  Android `versionName` / iOS `CFBundleShortVersionString`, and Android
  spans also carry `session.start_time`.
- `env`, `name` and `app.version` keys in `globalAttributes` stay span
  attributes; they are no longer moved to resource attributes (reverts the
  1.0.11 behavior).
- `telemetry.sdk.name` is now `@middleware-labs/middleware-react-native`
  (fixed spelling) and `telemetry.sdk.language` is `webjs`.
- Bumped Android `io.github.middleware-labs:android-sdk` 2.0.16-rn →
  2.0.18-rn, which adds resource attributes to session recordings.

### Fixed

- iOS: a global attribute of an unsupported type is converted to a string
  instead of crashing the app.
- iOS: crash reports and session recording uploads carry the session's
  resource attributes, including `session.id` and `session.start_time`.

## [1.0.23] - 2026-03-12

### Fixed

- Bumped Android `io.github.middleware-labs:android-sdk` 2.0.15-rn →
  2.0.16-rn, a further fix for out-of-memory errors during session
  recording.

## [1.0.22] - 2026-03-11

### Fixed

- Bumped Android `io.github.middleware-labs:android-sdk` 2.0.14-rn →
  2.0.15-rn, which fixes out-of-memory errors during session recording.

## [1.0.21] - 2026-02-18

### Changed

- Bumped Android `io.github.middleware-labs:android-sdk` 2.0.13-rn →
  2.0.14-rn, which moves session recording work to an I/O thread.

## [1.0.20] - 2026-01-30

### Added

- Spans carry a `session.start_time` resource attribute (epoch
  milliseconds), kept current when the session rotates.

## [1.0.19] - 2026-01-22

### Changed

- Bumped Android `io.github.middleware-labs:android-sdk` 2.0.8-rn →
  2.0.13-rn, with performance optimizations for session recording in React
  Native apps.

## [1.0.18] - 2025-10-31

### Fixed

- iOS: custom logs are sent with the account key (`Authorization`) header.
  The log exporter ignored its configured headers.

## [1.0.17] - 2025-09-18

### Added

- `startNavigationTracking(navigationRef)` is exported from the package
  entry point. Pass your React Navigation container ref to record a span per
  screen change and set `screen.name` / `last.screen.name`.

## [1.0.16] - 2025-08-08

### Changed

- XHR spans include the URL in their name (`HTTP GET <url>`).

## [1.0.15] - 2025-07-25

### Changed

- Bumped Android `io.github.middleware-labs:android-sdk` 2.0.7-rn →
  2.0.8-rn.

## [1.0.14] - 2025-07-24

### Changed

- fetch spans include the URL in their name (`HTTP GET <url>`).
- Response bodies with `Content-Type: application/json;charset=utf-8` are
  captured.

## [1.0.13] - 2025-07-23

### Fixed

- fetch instrumentation no longer throws when a request or response has no
  headers object.

## [1.0.12] - 2025-07-22

### Added

- fetch and XHR requests are traced with the OpenTelemetry fetch and
  XMLHttpRequest instrumentations (`event.type` `fetch` / `xhr`).
- Trace context propagation: `tracePropagationTargets` now adds trace headers
  to matching requests (it was accepted but unused before).
  `tracePropagationFormat: 'w3c'` sends `traceparent` and baggage, `'b3'`
  sends B3 single and multi headers, and leaving it unset sends both.
- Request and response headers are recorded as
  `http.request.header.<name>` / `http.response.header.<name>`, with
  `x-access-token` masked; list headers to skip in `ignoreHeaders`
  (`Set<string>`). Request bodies (`http.request.body`) and response bodies
  (`http.response.body`) are recorded too.
- `networkInstrumentation` config option, documented as turning off
  fetch/XHR instrumentation when `false` (it only worked as documented from
  2.1.5).
- Custom logs (`info`, `warn`, `error`, `debug`) are also recorded as spans
  with `event.type` set to the log level.
- Reported JS errors carry `error.type=reactNativeError`.

### Changed

- The SDK's own requests to `{target}/v1/traces`, `/v1/logs`, `/v1/metrics`
  and `/v1/rum` are always excluded from tracing, in addition to
  `ignoreUrls`.
- The SDK installs `react-native-url-polyfill` globally on import.

## [1.0.11] - 2025-07-18

### Changed

- The deployment environment is sent as the `env` resource attribute
  (was the `deployment.environment` attribute). `env`, `name` and
  `app.version` keys in `globalAttributes` are sent as resource attributes.
- The default `screen.name=unknown` resource attribute is no longer sent.

### Fixed

- iOS: global attributes are no longer copied into every span alongside the
  resource, which duplicated them; spans use the resource attributes set in
  JS.
- iOS: the account key is no longer added to telemetry as the
  `mw.account_key` attribute.

## [1.0.10] - 2025-07-17

### Fixed

- iOS: custom logs are no longer sent more than once.

## [1.0.9] - 2025-04-16

### Fixed

- `sessionRecording: false` disables session recording. It used to be
  ignored, so recording was always on. Leaving it unset keeps recording on.

## [1.0.8] - 2025-04-07

### Added

- Spans carry a `recording` resource attribute (`1` / `0`) and an `os`
  resource attribute (`iOS` / `Android`).
- iOS: crash spans have error status and carry `error.type`, `error.name`
  and `error.message`.

### Changed

- Bumped Android `io.github.middleware-labs:android-sdk` 2.0.7 → 2.0.7-rn, a
  React Native build of the native SDK. The Android module now enables core
  library desugaring (`desugar_jdk_libs` 2.0.4).
- Android: the native SDK's session recording is disabled entirely when
  recording is off.

## [1.0.7] - 2024-12-17

### Changed

- `session.id` is sent as a resource attribute and stays current when the
  session rotates.

## [1.0.6] - 2024-11-11

### Fixed

- Android: OpenTelemetry Java dependencies are pinned to 1.44.1 instead of
  floating `+` versions, which could resolve to incompatible versions at
  runtime. Bumped `io.github.middleware-labs:android-sdk` 2.0.5 → 2.0.7.

## [1.0.5] - 2024-10-01

### Changed

- Resource attributes: `mw.rum=true` is added, `middleware.rumVersion` is
  renamed to `mw.rum.sdk.version`, and `browser.mobile` is no longer sent.

## [1.0.4] - 2024-09-16

### Changed

- HTTP spans include the URL in their name (`HTTP GET <url>`).

## [1.0.3] - 2024-04-29

### Fixed

- Android: initialization no longer throws a `NullPointerException` when no
  Activity is current yet.
- Bumped Android `io.github.middleware-labs:android-sdk` 2.0.4 → 2.0.5, which
  guards session recording against null views and bitmaps and starts
  recording once the layout is attached.

## [1.0.2] - 2024-04-08

### Changed

- Bumped Android `io.github.middleware-labs:android-sdk` 2.0.1 → 2.0.4, which
  fixes its `commons-io` dependency; the SDK no longer pins Apache Commons
  libraries itself.

## [1.0.1] - 2024-04-08

### Fixed

- Fixed an infinite loop when a session expired or timed out.
- Android: fixed dependency conflicts by pinning the Apache Commons
  libraries pulled in by the native SDK.

## [1.0.0] - 2024-03-04

### Added

- Session recording on Android and iOS, on by default; set
  `sessionRecording: false` to turn it off (this only took effect from
  1.0.9).
- `MiddlewareSanitizedView` component: wrap views to mask their content in
  session recordings.

### Changed

- Bumped Android `io.github.middleware-labs:android-sdk` 1.0.8 → 2.0.1. The
  iOS pod now depends on `SWCompression`.
- Session inactivity timeout lowered from 15 to 5 minutes.
- Android: the native SDK uses the JS session id, so native telemetry and
  recordings share the JS session.

## [0.2.0] - 2024-02-26

### Removed

- Unused npm dependencies (OTLP HTTP exporters, fetch/document-load
  instrumentations, B3 propagator and others), reducing install size.

## [0.1.0] - 2024-02-09

### Added

- Initial release of the Middleware React Native RUM SDK for Android and iOS.
- Set up with `<MiddlewareWrapper configuration={...}>` or
  `MiddlewareRum.init(config)`. Required config: `target`, `accountKey`,
  `serviceName`, `projectName`; optional `deploymentEnvironment`,
  `globalAttributes`, `ignoreUrls`, `appStartEnabled`, `debug`.
- Automatic instrumentation: XHR/HTTP spans (with `Server-Timing`
  traceparent linking), unhandled JS errors, an `AppStart` span (cold/warm)
  ended by `MiddlewareWrapper` or `finishAppStart()`, and sessions (15-minute
  inactivity timeout, 4-hour maximum).
- Native crash reporting (iOS via PLCrashReporter, Android via
  `io.github.middleware-labs:android-sdk` 1.0.8) and ANR detection on
  Android.
- APIs: `info` / `warn` / `error` / `debug` custom logs, `reportError`,
  `setGlobalAttributes`, `updateLocation(latitude, longitude)`.
- Device model name attribute on telemetry. Requires iOS 11.0+.
