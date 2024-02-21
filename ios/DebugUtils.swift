// Copyright © 2023 Middleware. Licensed under the Apache License, Version 2.0

import Foundation

class DebugUtils: NSObject {

    static func error(_ str: String) {
        log(str)
    }

    static func log(_ str: String) {
        #if DEBUG
        print(str)
        #endif
    }
}
