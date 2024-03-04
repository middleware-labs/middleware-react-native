package com.middlewarereactnative;

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

  private interface Keys {
    StringKey TARGET = new StringKey("target");
    StringKey ACCOUNT_KEY = new StringKey("accountKey");
    StringKey PROJECT_NAME = new StringKey("projectName");
    StringKey SERVICE_NAME = new StringKey("serviceName");
    StringKey SESSION_RECORDING = new StringKey("sessionRecording");
    StringKey DEPLOYMENT_ENVIRONMENT = new StringKey("deploymentEnvironment");
    MapKey GLOBAL_ATTRIBUTES = new MapKey("globalAttributes");
  }
}
