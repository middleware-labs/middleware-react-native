package com.middlewarereactnative;

import static io.middleware.android.sdk.utils.Constants.LOG_TAG;

import android.app.Application;
import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.module.annotations.ReactModule;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import io.middleware.android.sdk.Middleware;
import io.middleware.android.sdk.builders.MiddlewareBuilder;
import io.middleware.android.sdk.core.replay.RecordingFrequency;
import io.middleware.android.sdk.core.replay.RecordingQuality;
import io.middleware.android.sdk.core.replay.v2.RecordingOptions;
import io.middleware.android.sdk.exporters.MiddlewareSpanExporter;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.common.AttributesBuilder;
import io.opentelemetry.api.trace.SpanContext;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.TraceFlags;
import io.opentelemetry.api.trace.TraceState;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.data.EventData;
import io.opentelemetry.sdk.trace.data.SpanData;
import io.opentelemetry.sdk.trace.data.StatusData;

@ReactModule(name = MiddlewareReactNativeModule.NAME)
public class MiddlewareReactNativeModule extends ReactContextBaseJavaModule {
  public static final String NAME = "MiddlewareReactNative";
  private final long moduleStartTime;
  private MiddlewareSpanExporter middlewareSpanExporter;
  private String nativeSessionId;
  /** Epoch millis as decimal string; set in setSessionId (matches iOS resource session.start_time). */
  @Nullable
  private String nativeSessionStartTimeMs;
  /** Injected into exported span Resource; JS resource payload does not include app.version. */
  private String nativeAppVersion;
  private static final String TAG = "MiddlewareReactNative";

  public MiddlewareReactNativeModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.moduleStartTime = System.currentTimeMillis();
  }

  @Override
  @NonNull
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void initialize(ReadableMap configMap, Promise promise) {
    final ConfigMapReader mapReader = new ConfigMapReader(configMap);
    final String target = mapReader.getTarget();
    final String accountKey = mapReader.getAccountKey();
    final String projectName = mapReader.getProjectName();
    final String serviceName = mapReader.getServiceName();
    final String sessionRecording = mapReader.getSessionRecording();
    final String deploymentEnvironment = mapReader.getDeploymentEnvironment();
    final ReadableMap globalAttributes = mapReader.getGlobalAttributes();
    final ReadableMap resourceAttributes = mapReader.getResourceAttributes();

    if (target == null || accountKey == null || projectName == null || serviceName == null) {
      reportFailure(promise, "Initialize: cannot construct exporter, target, serviceName, projectName or accountKey missing");
      return;
    }

    final String appVersion = getAppVersion(getReactApplicationContext());
    final Attributes attributes = attributesFromMap(resourceAttributes);
    final Attributes globalAttrs = attributesFromMap(globalAttributes);
    final AttributesBuilder attributesBuilder = attributes.toBuilder();
    final AttributesBuilder globalAttrsBuilder = globalAttrs.toBuilder();
    globalAttrsBuilder.put(AttributeKey.stringKey("app.version"), appVersion);
    attributesBuilder.put(AttributeKey.stringKey("app.version"), appVersion);
    final Attributes newGlobalAttributes = globalAttrsBuilder.build();
    final Attributes newResourceAttributes = attributesBuilder.build();
    nativeAppVersion = appVersion;

    MiddlewareBuilder builder = Middleware.builder()
      .setTarget(target)
      .setProjectName(projectName)
      .setServiceName(serviceName)
      .setRumAccessToken(accountKey)
      .setResourceAttributes(newResourceAttributes)
      .setGlobalAttributes(newGlobalAttributes)
      .setDeploymentEnvironment(deploymentEnvironment)
      // JS owns app-start/screen tracking and tap capture; the native
      // recorders (crash, ANR, network, slow rendering, v3 replay) stay on.
      .disableActivityLifecycleMonitoring()
      .disableUIInstrumentation();

    if (!Boolean.TRUE.toString().equals(sessionRecording)) {
      builder.disableSessionRecording();
    }
    final Double samplingRatio = mapReader.getSessionSamplingRatio();
    if (samplingRatio != null) {
      builder.setSessionSamplingRatio(samplingRatio);
    }
    final ReadableMap recordingOptionsMap = mapReader.getRecordingOptions();
    if (recordingOptionsMap != null) {
      builder.setRecordingOptions(recordingOptionsFromMap(recordingOptionsMap));
    }

    // Read the JS session out of the ReadableMap *before* hopping threads: the
    // map is owned by the bridge and is only valid for the duration of this
    // call, so it must not be touched from the posted Runnable.
    final String jsSessionId;
    final String jsStartMs;
    if (resourceAttributes != null
      && resourceAttributes.hasKey("session.id")
      && resourceAttributes.hasKey("session.start_time")
      && resourceAttributes.getString("session.id") != null) {
      jsSessionId = resourceAttributes.getString("session.id");
      jsStartMs = Long.toString(
        Math.round(resourceAttributes.getDouble("session.start_time")));
    } else {
      jsSessionId = null;
      jsStartMs = null;
    }

    // Middleware.build() registers a ProcessLifecycleOwner observer, and
    // androidx.lifecycle's LifecycleRegistry enforces the main thread —
    // off it, addObserver throws "Method addObserver must be called on the
    // main thread", initialization dies, middlewareSpanExporter is never
    // assigned, and every later export() is rejected. @ReactMethod runs on
    // the NativeModules thread, so hop explicitly.
    UiThreadUtil.runOnUiThread(() -> {
      try {
        // v3 session recording starts inside build() (sampler-gated); no explicit start needed.
        builder.build((Application) getReactApplicationContext().getApplicationContext());

        // Link the JS-owned session immediately — before the v3 recorder captures
        // its first frame — so no native telemetry lands under the native
        // auto-generated session.
        if (jsSessionId != null) {
          Middleware middleware = Middleware.getInstance();
          middleware.setGlobalAttribute(AttributeKey.stringKey("session.id"), jsSessionId);
          middleware.setGlobalAttribute(AttributeKey.stringKey("session.start_time"), jsStartMs);
          middleware.setNativeSession(jsSessionId, jsStartMs);
          this.nativeSessionId = jsSessionId;
          this.nativeSessionStartTimeMs = jsStartMs;
        }

        middlewareSpanExporter = Middleware.getInstance().getMiddlewareRum().getSpanExporter();
        WritableMap appStartInfo = Arguments.createMap();
        double appStart = (double) MiddlewarePreferenceProvider.getAppStartTime();
        AppStartTracker appStartTracker = AppStartTracker.getInstance();
        appStartInfo.putDouble("appStart", appStart);
        appStartInfo.putDouble("moduleStart", (double) this.moduleStartTime);
        appStartInfo.putBoolean("isColdStart", appStartTracker.isColdStart());
        promise.resolve(appStartInfo);
      } catch (Throwable t) {
        // On the NativeModules thread RN turned a throw into a promise
        // rejection; on the UI thread an uncaught throw would kill the app.
        Log.e(TAG, "Initialize: MiddlewareRum failed to start", t);
        reportFailure(promise, "Initialize: " + t);
      }
    });
  }


  private String getAppVersion(Context context) {
    try {
      // Align with iOS CFBundleShortVersionString: marketing / user-facing version only.
      String name = context.getPackageManager()
        .getPackageInfo(context.getPackageName(), 0)
        .versionName;
      if (name != null && !name.isEmpty()) {
        return name;
      }
    } catch (Exception e) {
      // fall through
    }
    return "unknown";
  }

  @ReactMethod
  public void nativeCrash() {
    new Thread(() -> {
      try {
        Thread.sleep(2000);
      } catch (InterruptedException e) {
      }
      throw new RuntimeException("test crash");
    }).start();
  }

  @ReactMethod
  public void nativeAnr() {
    for (int i = 1; i <= 25; i++) {
      try {
        Thread.sleep(1000);
        Middleware.getInstance().i("MiddlewareReactNative", "Sleeping Count : " + i);
      } catch (InterruptedException e) {
        e.printStackTrace();
      }
    }
  }

  @ReactMethod
  public void export(ReadableArray spanMaps, Promise promise) {

    if (middlewareSpanExporter == null) {
      reportFailure(promise, "Export: exporter not initialized");
      return;
    }

    List<SpanData> spanDataList = new ArrayList<>();

    for (int i = 0; i < spanMaps.size(); i++) {
      ReadableMap spanMap = spanMaps.getMap(i);
      SpanMapReader mapReader = new SpanMapReader(spanMap);

      SpanContext context = contextFromMap(mapReader);
      if (!context.isValid()) {
        reportFailure(promise, "Export: trace or span ID not provided");
        return;
      }

      SpanContext parentContext = parentContextFromMap(mapReader, context);
      ReactSpanProperties spanProperties = propertiesFromMap(mapReader);

      if (spanProperties == null) {
        reportFailure(promise, "Export: missing name, start or end time");
        return;
      }

      final String sessionId = nativeSessionId != null ? nativeSessionId : Middleware.getInstance().getRumSessionId();
      Attributes attributes = attributesFromMap(mapReader.getAttributes());
      attributes = attributes.toBuilder().put("session.id", sessionId).build();
      Attributes resourceAttributes = attributesFromMap(mapReader.getResource().getMap("_attributes"));
      String appVer =
        nativeAppVersion != null ? nativeAppVersion : getAppVersion(getReactApplicationContext());
      AttributesBuilder resourceBuilder = resourceAttributes.toBuilder()
        .put("session.id", sessionId)
        .put("app.version", appVer);
      if (nativeSessionStartTimeMs != null) {
        resourceBuilder.put("session.start_time", nativeSessionStartTimeMs);
      }
      resourceAttributes = resourceBuilder.build();
      final ReactSpanData spanData = new ReactSpanData(
        spanProperties,
        attributes,
        context,
        parentContext,
        spanProperties.events,
        Resource.create(resourceAttributes));
      spanDataList.add(spanData);
    }
    middlewareSpanExporter.export(spanDataList);
    promise.resolve(true);
  }

  @ReactMethod
  public void setSessionId(String sessionId, double startTimeMs) {
    Middleware middleware = Middleware.getInstance();
    // JS passes epoch milliseconds (Date.now / getSessionStartTime). Round like iOS Int64(startTimeMs.rounded()).
    // Never use String.valueOf(double): large millis (~1e12) can render as scientific notation and break parsers.
    long startMs = Math.round(startTimeMs);
    String startMsStr = Long.toString(startMs);
    middleware.setGlobalAttribute(AttributeKey.stringKey("session.id"), sessionId);
    middleware.setGlobalAttribute(AttributeKey.stringKey("session.start_time"), startMsStr);
    middleware.setNativeSession(sessionId, startMsStr);
    this.nativeSessionId = sessionId;
    this.nativeSessionStartTimeMs = startMsStr;
  }

  /**
   * Starts session recording, overriding both {@code sessionRecording: false} and the
   * session sampler. Sticky until stopRecording is called.
   */
  @ReactMethod
  public void startRecording(Promise promise) {
    UiThreadUtil.runOnUiThread(() -> {
      try {
        promise.resolve(Middleware.getInstance().startRecording());
      } catch (Throwable t) {
        reportFailure(promise, "startRecording: " + t);
      }
    });
  }

  /**
   * Stops session recording. Sticky across session rotation until startRecording.
   */
  @ReactMethod
  public void stopRecording(Promise promise) {
    UiThreadUtil.runOnUiThread(() -> {
      try {
        Middleware.getInstance().stopRecording();
        promise.resolve(!Middleware.getInstance().isRecording());
      } catch (Throwable t) {
        reportFailure(promise, "stopRecording: " + t);
      }
    });
  }

  @ReactMethod
  public void isRecording(Promise promise) {
    promise.resolve(Middleware.getInstance().isRecording());
  }

  @ReactMethod
  public void setGlobalAttributes(ReadableMap attributeMap) {
    Attributes attributesFromMap = attributesFromMap(attributeMap);
    setGlobalAttributes(attributesFromMap);
  }

  /**
   * Drives the native screen-name store from JS navigation, so native tap
   * spans and the v3 session recording (screenCustom/href) carry the JS route
   * name instead of the host ReactActivity class name.
   */
  @ReactMethod
  public void setScreenName(String screenName) {
    Middleware.getInstance().setScreenName(screenName);
  }

  @ReactMethod
  public void info(String message) {
    Middleware.getInstance().i(TAG, message);
  }

  @ReactMethod
  public void warn(String message) {
    Middleware.getInstance().w(TAG, message);
  }

  @ReactMethod
  public void error(String message) {
    Middleware.getInstance().e(TAG, message);
  }

  @ReactMethod
  public void debug(String message) {
    Middleware.getInstance().d(TAG, message);
  }

  private void setGlobalAttributes(Attributes attributes) {
    Middleware middleware = Middleware.getInstance();
    attributes.forEach((attributeKey, o) -> {
      middleware.setGlobalAttribute(AttributeKey.stringKey(attributeKey.getKey()), o.toString());
    });
  }

  @NonNull
  private SpanContext contextFromMap(SpanMapReader mapReader) {
    String traceId = mapReader.getTraceId();
    String spanId = mapReader.getSpanId();
    Long traceFlagsNumeric = mapReader.getTraceFlags();

    if (traceId == null || spanId == null) {
      return SpanContext.getInvalid();
    }

    TraceFlags traceFlags = traceFlagsNumeric != null ?
      TraceFlags.fromByte(traceFlagsNumeric.byteValue()) : TraceFlags.getSampled();

    return SpanContext.create(traceId, spanId, traceFlags, TraceState.getDefault());
  }

  @NonNull
  private SpanContext parentContextFromMap(SpanMapReader mapReader, SpanContext childContext) {
    String parentSpanId = mapReader.getParentSpanId();

    if (parentSpanId == null) {
      return SpanContext.getInvalid();
    }

    return SpanContext.create(childContext.getTraceId(), parentSpanId, childContext.getTraceFlags(),
      TraceState.getDefault());
  }

  private ReactSpanProperties propertiesFromMap(SpanMapReader mapReader) {
    String name = mapReader.getName();
    Long startTimeNanos = mapReader.getStartTimeNanos();
    Long endTimeNanos = mapReader.getEndTimeNanos();

    final ReadableArray readerEvents = mapReader.getEvents();
    final List<EventData> newEvents = new ArrayList<>();
    for (int index = 0; index < readerEvents.size(); index++) {
      final ReadableMap readableMap = readerEvents.getMap(index);
      final EventData eventData = EventData.create(
        Long.parseLong(Objects.requireNonNull(readableMap.getString("time"))),
        Objects.requireNonNull(readableMap.getString("name")),
        attributesFromMap(readableMap.getMap("attributes"))
      );
      newEvents.add(eventData);
    }

    if (name == null || startTimeNanos == null || endTimeNanos == null) {
      return null;
    }

    return new ReactSpanProperties(
      name,
      SpanKind.INTERNAL,
      newEvents,
      StatusData.ok(),
      startTimeNanos,
      endTimeNanos
    );
  }

  @NonNull
  private Attributes attributesFromMap(@Nullable ReadableMap attributeMap) {
    if (attributeMap == null) {
      return Attributes.empty();
    }

    Iterator<Map.Entry<String, Object>> iterator = attributeMap.getEntryIterator();

    AttributesBuilder builder = Attributes.builder();

    while (iterator.hasNext()) {
      Map.Entry<String, Object> entry = iterator.next();
      Object value = entry.getValue();

      if (value instanceof String) {
        builder.put(entry.getKey(), (String) value);
      } else if (value instanceof Number) {
        if ("http.status_code".equals(entry.getKey())) {
          builder.put(entry.getKey(), ((Number) value).intValue());
        } else {
          builder.put(entry.getKey(), ((Number) value).doubleValue());
        }
      }
    }
    return builder.build();
  }

  @NonNull
  private RecordingOptions recordingOptionsFromMap(@NonNull ReadableMap map) {
    RecordingOptions.Builder options = new RecordingOptions.Builder();
    String frequency = map.hasKey("frequency") ? map.getString("frequency") : null;
    if (frequency != null) {
      switch (frequency.toLowerCase()) {
        case "high":
          options.setFrequency(RecordingFrequency.HIGH);
          break;
        case "standard":
          options.setFrequency(RecordingFrequency.STANDARD);
          break;
        default:
          options.setFrequency(RecordingFrequency.LOW);
      }
    }
    String quality = map.hasKey("quality") ? map.getString("quality") : null;
    if (quality != null) {
      switch (quality.toLowerCase()) {
        case "high":
          options.setQuality(RecordingQuality.HIGH);
          break;
        case "standard":
          options.setQuality(RecordingQuality.MEDIUM);
          break;
        default:
          options.setQuality(RecordingQuality.LOW);
      }
    }
    if (map.hasKey("maskAllTextInputs")) {
      options.setMaskAllTextInputs(map.getBoolean("maskAllTextInputs"));
    }
    if (map.hasKey("maskAllImages")) {
      options.setMaskAllImages(map.getBoolean("maskAllImages"));
    }
    return options.build();
  }

  private static void reportFailure(Promise promise, String message) {
    Log.d("MiddlewareReactNative", message);
    promise.reject("MiddlewareReactNative Error", message);
  }

  private static long millisToNanos(long millis) {
    return millis * 1000000;
  }

}
