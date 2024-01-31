package com.middlewarereactnative;

import androidx.annotation.NonNull;

import java.util.List;

import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.sdk.trace.data.EventData;
import io.opentelemetry.sdk.trace.data.StatusData;

public class ReactSpanProperties {
  @NonNull public final String name;
  @NonNull public final SpanKind kind;
  @NonNull public final StatusData statusData;
  public final long startEpochNanos;
  public final long endEpochNanos;
  public final List<EventData> events;

  public ReactSpanProperties(
    @NonNull String name,
    @NonNull SpanKind kind,
    List<EventData> events,
    @NonNull StatusData statusData,
    long startEpochNanos,
    long endEpochNanos
  ) {
    this.name = name;
    this.kind = kind;
    this.events = events;
    this.statusData = statusData;
    this.startEpochNanos = startEpochNanos;
    this.endEpochNanos = endEpochNanos;
  }
}
