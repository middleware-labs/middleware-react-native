package com.middlewarereactnative;

import android.view.ViewGroup;

import androidx.annotation.NonNull;

import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewGroupManager;

public class NativeSanitizedViewManager extends ViewGroupManager<ViewGroup> {
  @NonNull
  @Override
  public String getName() {
    return "NativeSanitizedView";
  }

  @NonNull
  @Override
  protected ViewGroup createViewInstance(@NonNull ThemedReactContext themedReactContext) {
    return new NativeSanitizedView(themedReactContext);
  }
}
