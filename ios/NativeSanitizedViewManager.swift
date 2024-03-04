// Copyright © 2023 Middleware. Licensed under the Apache License, Version 2.0

import Foundation

@objc(NativeSanitizedViewManager)
class NativeSanitizedViewManager: RCTViewManager {
    override func view() -> (NativeSanitizedView) {
        return NativeSanitizedView()
      }

      @objc override static func requiresMainQueueSetup() -> Bool {
        return true
      }
}

class NativeSanitizedView : UIView {
    override func didMoveToSuperview() {
        super.didMoveToSuperview()

        if superview != nil {
            ScreenshotManager.shared.addSanitizedElement(self)
        }
    }
}
