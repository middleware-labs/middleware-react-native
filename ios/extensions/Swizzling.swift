// Copyright © 2023 Middleware. Licensed under the Apache License, Version 2.0

#if os(iOS) || targetEnvironment(macCatalyst) || os(tvOS)
import UIKit

class Swizzling: NSObject {
    static func swizzle(cls: AnyClass, original: Selector, swizzled: Selector) {
        if let originalMethod = class_getInstanceMethod(cls, original),
           let swizzledMethod = class_getInstanceMethod(cls, swizzled) {
            method_exchangeImplementations(originalMethod, swizzledMethod)
        }
    }
    static func swizzleIfPresent(cls: AnyClass, original: Selector, swizzled: Selector) {
        if let originalMethod = class_getInstanceMethod(cls, original),
           let swizzledMethod = class_getInstanceMethod(cls, swizzled) {
            let didAddMethod = class_addMethod(self, original, method_getImplementation(swizzledMethod), method_getTypeEncoding(swizzledMethod))
            if didAddMethod {
                class_replaceMethod(self, swizzled, method_getImplementation(originalMethod), method_getTypeEncoding(originalMethod))
            } else {
                method_exchangeImplementations(originalMethod, swizzledMethod)
            }
        }
    }
}
#endif
