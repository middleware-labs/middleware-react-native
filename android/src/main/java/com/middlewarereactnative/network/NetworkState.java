package com.middlewarereactnative.network;

import static io.opentelemetry.semconv.SemanticAttributes.NetworkConnectionTypeValues.CELL;
import static io.opentelemetry.semconv.SemanticAttributes.NetworkConnectionTypeValues.UNAVAILABLE;
import static io.opentelemetry.semconv.SemanticAttributes.NetworkConnectionTypeValues.UNKNOWN;
import static io.opentelemetry.semconv.SemanticAttributes.NetworkConnectionTypeValues.WIFI;

enum NetworkState {
  NO_NETWORK_AVAILABLE(UNAVAILABLE),
  TRANSPORT_CELLULAR(CELL),
  TRANSPORT_WIFI(WIFI),
  TRANSPORT_UNKNOWN(UNKNOWN),
  TRANSPORT_VPN("vpn");

  private final String humanName;

  NetworkState(String humanName) {
    this.humanName = humanName;
  }

  String getHumanName() {
    return humanName;
  }
}
