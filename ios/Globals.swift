fileprivate var globalAttributes = RWLocked<[String:String]>(initialValue: [:])
fileprivate var sessionId = RWLocked<String>(initialValue: "")

struct Globals {
    static func setGlobalAttributes(_ attributes: [String:String]) {
        globalAttributes.write(value: attributes)
    }

    static func getGlobalAttributes() -> [String:String] {
        return globalAttributes.read()
    }
    
    static func setSessionId(_ id: String) {
        sessionId.write(value: id)
    }
    
    static func getSessionId() -> String {
        return sessionId.read()
    }
}
