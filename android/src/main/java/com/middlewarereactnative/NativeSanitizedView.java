package com.middlewarereactnative;

import android.content.Context;
import android.view.ViewGroup;

import io.middleware.android.sdk.Middleware;

public class NativeSanitizedView extends ViewGroup {
  public NativeSanitizedView(Context context) {
    super(context);
    Middleware.getInstance().addSanitizedElement(this);
  }

  @Override
  protected void onLayout(boolean changed, int l, int t, int r, int b) {

  }

}
