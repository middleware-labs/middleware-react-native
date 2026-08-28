/**
 * Expo config plugin for @middleware.io/middleware-react-native.
 *
 * The SDK pulls in two native SDKs (io.github.middleware-labs:android-sdk and
 * the MiddlewareRum CocoaPod) whose build requirements can't be expressed from
 * a managed Expo project. This plugin applies them during `expo prebuild` so
 * `npx expo run:android` / `run:ios` and EAS Build work without hand-editing
 * the generated native projects.
 *
 * Usage (app.json / app.config.js):
 *
 *   { "expo": { "plugins": ["@middleware.io/middleware-react-native"] } }
 *
 * Options (all optional):
 *   kotlinVersion        - min Kotlin Gradle Plugin version   (default 2.0.21)
 *   compileSdkVersion    - min Android compileSdk             (default 35)
 *   iosDeploymentTarget  - min iOS deployment target          (default 13.0)
 *   jetifierIgnorelist   - add android.jetifier.ignorelist    (default true)
 *   reachabilityModularHeaders - Podfile `pod 'Reachability', :modular_headers => true`
 *                          when the app builds pods as static libraries (default true)
 */

const {
  createRunOncePlugin,
  withGradleProperties,
  withProjectBuildGradle,
  withPodfile,
  withPodfileProperties,
} = require('@expo/config-plugins');

const DEFAULTS = {
  kotlinVersion: '2.0.21',
  compileSdkVersion: 35,
  iosDeploymentTarget: '13.0',
  jetifierIgnorelist: true,
  reachabilityModularHeaders: true,
};

/** Compares dotted version strings without pulling in semver. */
function isVersionBelow(current, minimum) {
  const a = String(current)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const b = String(minimum)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) {
      return x < y;
    }
  }
  return false;
}

function setGradleProperty(properties, key, value) {
  const existing = properties.find(
    (item) => item.type === 'property' && item.key === key
  );
  if (existing) {
    existing.value = value;
    return properties;
  }
  properties.push({ type: 'property', key, value });
  return properties;
}

/**
 * `android-sdk` 3.x ships a Jetifier-hostile jackson-core; without this the
 * Android build fails at the jetifier transform step.
 * Also raises compileSdk, which the library's build.gradle reads from
 * `rootProject.ext`.
 */
const withMiddlewareGradleProperties = (config, opts) =>
  withGradleProperties(config, (cfg) => {
    if (opts.jetifierIgnorelist) {
      const key = 'android.jetifier.ignorelist';
      const existing = cfg.modResults.find(
        (item) => item.type === 'property' && item.key === key
      );
      if (!existing) {
        setGradleProperty(cfg.modResults, key, 'jackson-core');
      } else if (!existing.value.split(',').includes('jackson-core')) {
        existing.value = `${existing.value},jackson-core`;
      }
    }

    // Only raise an explicitly pinned compileSdk. When the property is absent
    // the value comes from the Expo template's own default in
    // android/build.gradle (36 on SDK 54), which already clears our floor —
    // writing ours would be a downgrade and would break RN 0.81 itself.
    const compileSdk = cfg.modResults.find(
      (item) =>
        item.type === 'property' && item.key === 'android.compileSdkVersion'
    );
    if (
      compileSdk &&
      isVersionBelow(compileSdk.value, String(opts.compileSdkVersion))
    ) {
      compileSdk.value = String(opts.compileSdkVersion);
    }
    return cfg;
  });

/** android-sdk 3.x is built with Kotlin 2.0.21; older KGP fails to read its metadata. */
const withMiddlewareKotlinVersion = (config, opts) =>
  withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      return cfg;
    }
    const contents = cfg.modResults.contents;
    const match = contents.match(
      /kotlinVersion\s*=\s*findProperty\(['"][^'"]*['"]\)\s*\?:\s*['"]([\d.]+)['"]/
    );

    if (match) {
      if (isVersionBelow(match[1], opts.kotlinVersion)) {
        cfg.modResults.contents = contents.replace(
          match[0],
          match[0].replace(match[1], opts.kotlinVersion)
        );
      }
      return cfg;
    }

    const simple = contents.match(/kotlinVersion\s*=\s*['"]([\d.]+)['"]/);
    if (simple && isVersionBelow(simple[1], opts.kotlinVersion)) {
      cfg.modResults.contents = contents.replace(
        simple[0],
        `kotlinVersion = '${opts.kotlinVersion}'`
      );
    }
    return cfg;
  });

/** The MiddlewareRum pod needs iOS >= 13.0. */
const withMiddlewareDeploymentTarget = (config, opts) =>
  withPodfileProperties(config, (cfg) => {
    const current = cfg.modResults['ios.deploymentTarget'];
    if (!current || isVersionBelow(current, opts.iosDeploymentTarget)) {
      cfg.modResults['ios.deploymentTarget'] = opts.iosDeploymentTarget;
    }
    return cfg;
  });

/**
 * Reachability (a transitive MiddlewareRum dependency) has no modulemap, so
 * Swift can't import it when pods build as static libraries. Skipped when the
 * app uses frameworks (`expo-build-properties` useFrameworks), where CocoaPods
 * generates the module for us.
 */
const withMiddlewareReachability = (config, opts) =>
  withPodfile(config, (cfg) => {
    if (!opts.reachabilityModularHeaders) {
      return cfg;
    }
    const contents = cfg.modResults.contents;
    if (
      contents.includes("pod 'Reachability'") ||
      contents.includes('pod "Reachability"')
    ) {
      return cfg;
    }
    if (/^\s*use_frameworks!/m.test(contents)) {
      return cfg;
    }

    const anchor = /(\n\s*)(use_expo_modules!|config = use_native_modules!)/;
    const match = contents.match(anchor);
    if (!match) {
      return cfg;
    }
    cfg.modResults.contents = contents.replace(
      anchor,
      `${match[1]}# @middleware.io/middleware-react-native: Reachability ships no modulemap` +
        `${match[1]}pod 'Reachability', :modular_headers => true` +
        `${match[1]}${match[2]}`
    );
    return cfg;
  });

const withMiddlewareRum = (config, options = {}) => {
  const opts = { ...DEFAULTS, ...options };
  config = withMiddlewareGradleProperties(config, opts);
  config = withMiddlewareKotlinVersion(config, opts);
  config = withMiddlewareDeploymentTarget(config, opts);
  config = withMiddlewareReachability(config, opts);
  return config;
};

const pkg = require('../package.json');

module.exports = createRunOncePlugin(withMiddlewareRum, pkg.name, pkg.version);
