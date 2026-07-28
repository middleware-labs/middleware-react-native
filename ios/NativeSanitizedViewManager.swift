// Copyright © 2023 Middleware. Licensed under the Apache License, Version 2.0

import Foundation
import MiddlewareRum

@objc(NativeSanitizedViewManager)
class NativeSanitizedViewManager: RCTViewManager {
    override func view() -> (NativeSanitizedView) {
        return NativeSanitizedView()
      }

      @objc override static func requiresMainQueueSetup() -> Bool {
        return true
      }
}

/// Children of this view are masked in session recording (v2 blur and v3
/// black-box alike, via MiddlewareRum's ignored-view registry).
class NativeSanitizedView: UIView {
    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            MiddlewareRum.addIgnoredView(self)
        } else {
            MiddlewareRum.removeIgnoredView(self)
        }
    }
}
