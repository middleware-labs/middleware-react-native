fileprivate var globalAttributes = RWLocked<[String: String]>(initialValue: [:])
fileprivate var resourceAttributes = RWLocked<[String: String]>(initialValue: [:])
fileprivate var sessionId = RWLocked<String>(initialValue: "")

/// Shared formatter avoids allocating a new `ISO8601DateFormatter` per `Date` in `convertToString`.
private let iso8601Formatter = ISO8601DateFormatter()

struct Globals {
    private init() {}

    static func setGlobalAttributes(_ attributes: [String: String]) {
        globalAttributes.write(value: attributes)
    }

    static func setResourceAttributes(_ attributes: [String: String]) {
        resourceAttributes.write(value: attributes)
    }

    static func getGlobalAttributes() -> [String: String] {
        globalAttributes.read()
    }

    static func getResourceAttributes() -> [String: String] {
        resourceAttributes.read()
    }

    static func setSessionId(_ id: String) {
        sessionId.write(value: id)
    }

    static func getSessionId() -> String {
        sessionId.read()
    }

    /// Converts bridge dictionaries to OTLP attribute values. Unknown types stringify to avoid crashing the host app.
    static func convertToAttributeValue(dictionary: [String: Any]) -> [String: AttributeValue] {
        var attributeValues: [String: AttributeValue] = [:]
        attributeValues.reserveCapacity(dictionary.count)

        for (key, value) in dictionary {
            let attributeValue: AttributeValue
            switch value {
            case let stringValue as String:
                attributeValue = .string(stringValue)
            case let intValue as Int:
                attributeValue = .int(intValue)
            case let doubleValue as Double:
                attributeValue = .double(doubleValue)
            case let boolValue as Bool:
                attributeValue = .bool(boolValue)
            default:
                attributeValue = .string(String(describing: value))
            }
            attributeValues[key] = attributeValue
        }

        return attributeValues
    }

    /// String map for OTLP attribute dictionaries (avoids copying through `[String: Any]`).
    static func convertToString(_ attributes: [String: AttributeValue]) -> [String: String] {
        var result: [String: String] = [:]
        result.reserveCapacity(attributes.count)
        for (key, value) in attributes {
            result[key] = value.description
        }
        return result
    }

    static func convertToString(dictionary: [String: Any]) -> [String: String] {
        var result: [String: String] = [:]
        result.reserveCapacity(dictionary.count)

        for (key, value) in dictionary {
            switch value {
            case let v as AttributeValue:
                result[key] = v.description
            case let v as String:
                result[key] = v
            case let v as Int:
                result[key] = String(v)
            case let v as Double:
                result[key] = String(v)
            case let v as Bool:
                result[key] = String(v)
            case let v as Date:
                result[key] = iso8601Formatter.string(from: v)
            case let v as [String: Any]:
                if let data = try? JSONSerialization.data(withJSONObject: v),
                   let json = String(data: data, encoding: .utf8) {
                    result[key] = json
                }
            case let v as [Any]:
                if let data = try? JSONSerialization.data(withJSONObject: v),
                   let json = String(data: data, encoding: .utf8) {
                    result[key] = json
                }
            case Optional<Any>.none:
                continue
            default:
                result[key] = String(describing: value)
            }
        }

        return result
    }
}
