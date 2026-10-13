package com.middlewarereactnative;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableType;

public class ConfigMapReader extends MapReader {
  private final ReadableMap map;

  public ConfigMapReader(ReadableMap map) {
    this.map = map;
  }

  public String getTarget() {
    return Keys.TARGET.get(map);
  }

  public String getAccountKey() {
    return Keys.ACCOUNT_KEY.get(map);
  }


  public String getProjectName() {
    return Keys.PROJECT_NAME.get(map);
  }

  public String getServiceName() {
    return Keys.SERVICE_NAME.get(map);
  }

  public String getSessionRecording() {
    return Keys.SESSION_RECORDING.get(map);
  }

  public String getDeploymentEnvironment() {
    return Keys.DEPLOYMENT_ENVIRONMENT.get(map);
  }

  public ReadableMap getGlobalAttributes() {
    return Keys.GLOBAL_ATTRIBUTES.getMap(map);
  }

  public ReadableMap getResourceAttributes() {
    return Keys.RESOURCE_ATTRIBUTES.getMap(map);
  }

  public ReadableMap getRecordingOptions() {
    return Keys.RECORDING_OPTIONS.getMap(map);
  }

  public Double getSessionSamplingRatio() {
    return map.hasKey("sessionSamplingRatio") ? map.getDouble("sessionSamplingRatio") : null;
  }

  public boolean getCaptureNetworkHeaders() {
    return Boolean.TRUE.equals(Keys.CAPTURE_NETWORK_HEADERS.get(map));
  }

  public boolean getCaptureResponseBodies() {
    return Boolean.TRUE.equals(Keys.CAPTURE_RESPONSE_BODIES.get(map));
  }

  /** Lowercase header names; empty when unset. */
  public List<String> getIgnoreHeaders() {
    final List<String> headers = new ArrayList<>();
    if (!map.hasKey("ignoreHeaders") || map.getType("ignoreHeaders") != ReadableType.Array) {
      return headers;
    }
    final ReadableArray array = map.getArray("ignoreHeaders");
    if (array == null) {
      return headers;
    }
    for (int i = 0; i < array.size(); i++) {
      if (array.getType(i) == ReadableType.String) {
        final String header = array.getString(i);
        if (header != null) {
          headers.add(header.toLowerCase(Locale.ROOT));
        }
      }
    }
    return headers;
  }

  private interface Keys {
    StringKey TARGET = new StringKey("target");
    StringKey ACCOUNT_KEY = new StringKey("accountKey");
    StringKey PROJECT_NAME = new StringKey("projectName");
    StringKey SERVICE_NAME = new StringKey("serviceName");
    StringKey SESSION_RECORDING = new StringKey("sessionRecording");
    StringKey DEPLOYMENT_ENVIRONMENT = new StringKey("deploymentEnvironment");
    MapKey GLOBAL_ATTRIBUTES = new MapKey("globalAttributes");
    MapKey RESOURCE_ATTRIBUTES = new MapKey("resourceAttributes");
    MapKey RECORDING_OPTIONS = new MapKey("recordingOptions");
    BooleanKey CAPTURE_NETWORK_HEADERS = new BooleanKey("captureNetworkHeaders");
    BooleanKey CAPTURE_RESPONSE_BODIES = new BooleanKey("captureResponseBodies");
  }
}
