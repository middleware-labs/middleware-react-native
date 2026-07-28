package com.middlewarereactnative;

import java.util.Map;

import com.facebook.react.bridge.ReadableMap;

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

  public boolean getDisableSessionRecordingV3() {
    return map.hasKey("disableSessionRecordingV3") && map.getBoolean("disableSessionRecordingV3");
  }

  public Double getSessionSamplingRatio() {
    return map.hasKey("sessionSamplingRatio") ? map.getDouble("sessionSamplingRatio") : null;
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
  }
}
