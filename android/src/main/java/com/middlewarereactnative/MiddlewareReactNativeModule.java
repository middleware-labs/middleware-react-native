package com.middlewarereactnative;

import android.app.Application;
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
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.module.annotations.ReactModule;
import com.middlewarereactnative.network.CurrentNetwork;
import com.middlewarereactnative.network.CurrentNetworkAttributesExtractor;
import com.middlewarereactnative.network.CurrentNetworkProvider;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import io.middleware.android.sdk.Middleware;
import io.middleware.android.sdk.exporters.MiddlewareSpanExporter;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.common.AttributesBuilder;
import io.opentelemetry.api.trace.SpanContext;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.TraceFlags;
import io.opentelemetry.api.trace.TraceState;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.data.SpanData;
import io.opentelemetry.sdk.trace.data.StatusData;

@ReactModule(name = MiddlewareReactNativeModule.NAME)
public class MiddlewareReactNativeModule extends ReactContextBaseJavaModule {
  public static final String NAME = "MiddlewareReactNative";
  private final long moduleStartTime;
  private MiddlewareSpanExporter middlewareSpanExporter;
  private CurrentNetworkProvider currentNetworkProvider;
  private String nativeSessionId;

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
    final String deploymentEnvironment = mapReader.getDeploymentEnvironment();
    final ReadableMap globalAttributes = mapReader.getGlobalAttributes();

    if (target == null || accountKey == null || projectName == null || serviceName == null) {
      reportFailure(promise, "Initialize: cannot construct exporter, target, serviceName, projectName or accountKey missing");
      return;
    }

    Middleware.builder()
      .setTarget(target)
      .setProjectName(projectName)
      .setServiceName(serviceName)
      .setGlobalAttributes(attributesFromMap(globalAttributes))
      .setRumAccessToken(accountKey)
      .setDeploymentEnvironment(deploymentEnvironment)
      .disableNetworkMonitor()
      .disableActivityLifecycleMonitoring()
      .build((Application) getReactApplicationContext().getApplicationContext().getApplicationContext());

    middlewareSpanExporter = Middleware.getInstance().getMiddlewareRum().getSpanExporter();
    currentNetworkProvider = CurrentNetworkProvider.createAndStart((Application) getReactApplicationContext().getApplicationContext());
    WritableMap appStartInfo = Arguments.createMap();
    double appStart = (double) MiddlewarePreferenceProvider.getAppStartTime();
    AppStartTracker appStartTracker = AppStartTracker.getInstance();
    appStartInfo.putDouble("appStart", appStart);
    appStartInfo.putDouble("moduleStart", (double) this.moduleStartTime);
    appStartInfo.putBoolean("isColdStart", appStartTracker.isColdStart());
    promise.resolve(appStartInfo);
  }


  @ReactMethod
  public void nativeCrash() {
    new Thread(() -> {
      try {
        Thread.sleep(2000);
      } catch (InterruptedException e) {}
      throw new RuntimeException("test crash");
    }).start();
  }

  @ReactMethod
  public void export(ReadableArray spanMaps, Promise promise) {

    if (middlewareSpanExporter == null) {
      reportFailure(promise, "Export: exporter not initialized");
      return;
    }

    List<SpanData> spanDataList = new ArrayList<>();

    CurrentNetwork network = currentNetworkProvider.refreshNetworkStatus();
    CurrentNetworkAttributesExtractor networkAttributesExtractor = new CurrentNetworkAttributesExtractor();
    Attributes networkAttributes = networkAttributesExtractor.extract(network);

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
      Attributes attributes = attributesFromMap(mapReader.getAttributes()).toBuilder().putAll(networkAttributes).build();
      attributes = attributes.toBuilder().put("session.id", sessionId).build();
      Attributes resourceAttributes = attributesFromMap(mapReader.getResource().getMap("_attributes"));
      resourceAttributes = resourceAttributes.toBuilder().put("session.id", sessionId).build();
      final ReactSpanData spanData = new ReactSpanData(spanProperties, attributes, context, parentContext,
        Collections.emptyList(), Resource.create(resourceAttributes));
      spanDataList.add(spanData);
    }
    middlewareSpanExporter.export(spanDataList);
    promise.resolve(true);
  }


  @ReactMethod
  public void setSessionId(String sessionId) {
    Middleware.getInstance().setGlobalAttribute(AttributeKey.stringKey("session.id"), sessionId);
    this.nativeSessionId = sessionId;
  }

  @ReactMethod
  public void setGlobalAttributes(ReadableMap attributeMap) {
    Attributes attributesFromMap = attributesFromMap(attributeMap);
    setGlobalAttributes(attributesFromMap);
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
    Long startEpochMillis = mapReader.getStartEpochMillis();
    Long endEpochMillis = mapReader.getEndEpochMillis();

    if (name == null || startEpochMillis == null || endEpochMillis == null) {
      return null;
    }

    return new ReactSpanProperties(
      name,
      SpanKind.INTERNAL,
      StatusData.ok(),
      millisToNanos(startEpochMillis),
      millisToNanos(endEpochMillis)
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

  private static void reportFailure(Promise promise, String message) {
    Log.d("MiddlewareReactNative", message);
    promise.reject("MiddlewareReactNative Error", message);
  }

  private static long millisToNanos(long millis) {
    return millis * 1000000;
  }

}
