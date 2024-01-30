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
    
    static func convertToAttributeValue(dictionary: [String: Any]) -> [String: AttributeValue] {
        var attributeValues: [String: AttributeValue] = [:]
        
        for (key, value) in dictionary {
            let attributeValue: AttributeValue
            
            if let stringValue = value as? String {
                attributeValue = AttributeValue.string(stringValue)
            } else if let intValue = value as? Int {
                attributeValue = AttributeValue.int(intValue)
            } else if let doubleValue = value as? Double {
                attributeValue = AttributeValue.double(doubleValue)
            } else if let boolValue = value as? Bool {
                attributeValue = AttributeValue.bool(boolValue)
            } else {
                // Handle other types as needed
                fatalError("Unsupported data type for key: \(key)")
            }
            attributeValues[key] = attributeValue
        }
        
        return attributeValues
    }
    
}
