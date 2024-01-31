import Foundation
import DeviceKit

class OtelEndpoint: Encodable {
    var serviceName: String
    var ipv4: String?
    var ipv6: String?
    var port: Int?
    
    public init(serviceName: String, ipv4: String? = nil, ipv6: String? = nil, port: Int? = nil) {
        self.serviceName = serviceName
        self.ipv4 = ipv4
        self.ipv6 = ipv6
        self.port = port
    }
    
    public func clone(serviceName: String) -> OtelEndpoint {
        return OtelEndpoint(serviceName: serviceName, ipv4: ipv4, ipv6: ipv6, port: port)
    }
    
    public func write() -> [String: Any] {
        var output = [String: Any]()
        
        output["serviceName"] = serviceName
        output["ipv4"] = ipv4
        output["ipv6"] = ipv6
        output["port"] = port
        
        return output
    }
}


class OtelSpan: Encodable {
    var traceId: String
    var parentId: String?
    var spanId: String
    var kind: String?
    var name: String
    var startTime: UInt64
    var duration: UInt64?
    var attributes: [String: String]
    var events: [SpanEvent]
    
    init(traceId: String, parentId: String? = nil, spanId: String, kind: String? = nil, name: String, startTime: UInt64, duration: UInt64? = nil, attributes: [String : String], events: [SpanEvent]) {
        self.traceId = traceId
        self.parentId = parentId
        self.spanId = spanId
        self.kind = kind
        self.name = name
        self.startTime = startTime
        self.duration = duration
        self.attributes = attributes
        self.events = events
    }
}

struct SpanEvent: Encodable {
    var name: String
    var timestamp: Date
}

extension OtelSpan {
    func setAttribute(key: String, value: String) {
        self.attributes[key] = value
    }
    func setAttribute(key: String, value: Bool) {
        self.attributes[key] = value.description
    }
    
    func addEvent(name: String, timestamp: Date) {
        self.events.append(SpanEvent(name: name, timestamp: timestamp))
    }
}

struct OtelTransform {
    static func toOtelSpans(spans: [Dictionary<String, Any>], attributes: [String: Any]) -> [SpanData] {
        return spans.map { toOtelSpan(otelSpan: $0, globalAttributes: attributes) }
    }
    
    static func toOtelSpan(otelSpan: Dictionary<String, Any>, globalAttributes: [String: Any]) -> SpanData {
        let parentId = otelSpan["parentSpanId"] as? String
        let traceId = otelSpan["traceId"] as? String ?? "00000000000000000000000000000000"
        let spanId = otelSpan["spanId"] as? String ?? "0000000000000000"
        let name = otelSpan["name"] as? String ?? "unknown"
        let events = otelSpan["events"] as? [Dictionary<String, Any>] ?? []
        let status = otelSpan["status"] as? Dictionary<String, Any> ?? [:]
        let jsTags = otelSpan["attributes"] as? Dictionary<String, Any> ?? [:]
        let startTime = anyToTimestamp(otelSpan["startTime"])
        let endTime = anyToTimestamp(otelSpan["endTime"])
        
        var attributes: [String: AttributeValue] = [:]
        
        for t in jsTags {
            switch t.value {
            case is String:
                attributes[t.key] = AttributeValue(t.value as! String)
            case is Double:
                attributes[t.key] = AttributeValue((t.value as! Double).description)
            case is Bool:
                attributes[t.key] = AttributeValue((t.value as! Bool).description)
            case is Int:
                attributes[t.key] = AttributeValue((t.value as! Int).description)
            default:
                break
            }
        }
        
        for t in globalAttributes {
            switch t.value {
            case is String:
                attributes[t.key] = AttributeValue(t.value as! String)
            case is Double:
                attributes[t.key] = AttributeValue((t.value as! Double).description)
            case is Bool:
                attributes[t.key] = AttributeValue((t.value as! Bool).description)
            case is Int:
                attributes[t.key] = AttributeValue((t.value as! Int).description)
            default:
                break
            }
        }
        
        attributes[ResourceAttributes.deviceModelName.rawValue] = AttributeValue(Device.current.description! as String)
        let bundleVersion = Bundle.main.infoDictionary?["CFBundleVersion"] as? String
        let bundleShortVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        let appVersion = bundleShortVersion ?? bundleVersion
        attributes["app.version"] = AttributeValue(appVersion!)
        
        var newEvents: [SpanData.Event] = []
        if(events.count > 0) {
            for event in events {
                let eventName = event["name"] as! String
                let timestamp = anyToTimestamp(event["time"])
                let eventAttributes = event["attributes"] as? Dictionary<String, Any> ?? [:]
                let newEventAttributes = Globals.convertToAttributeValue(dictionary: eventAttributes)
                newEvents.append(SpanData.Event(name: eventName, timestamp: timestamp, attributes: newEventAttributes))
            }
        }
        
        
        return SpanData(traceId: TraceId(fromHexString: traceId),
                        spanId: SpanId(id: UInt64(spanId, radix: 16) ?? 0),
                        parentSpanId: parentId != nil ? SpanId(id: UInt64(parentId!, radix: 16) ?? 0) : nil,
                        resource: Resource(attributes: attributes),
                        name: name,
                        kind: transformKind(otelSpan["kind"] as? Int ?? 0),
                        startTime: startTime,
                        attributes: attributes,
                        events: newEvents,
                        endTime: endTime,
                        totalRecordedEvents: newEvents.count,
                        totalAttributeCount: attributes.count
        )
    }
}

private func transformKind(_ kind: Int) -> SpanKind {
    switch kind {
    case 0:
        return SpanKind.internal
    case 1:
        return SpanKind.client
    case 2:
        return SpanKind.server
    case 3:
        return SpanKind.consumer
    case 4:
        return SpanKind.producer
    default:
        return SpanKind.internal
    }
}

public func anyToUInt64(_ v: Any?) -> UInt64 {
    if v == nil {
        return 0
    }
    
    switch v {
    case is Double:
        let doubleValue = v as! Double
        if (doubleValue >= 0.0) {
            return UInt64(doubleValue)
        }
        return 0
    case is Int:
        let intValue = v as! Int
        if (intValue >= 0) {
            return UInt64(intValue)
        }
        return 0
    default:
        return 0
    }
}

public func anyToTimestamp(_ v: Any?) -> Date {
    if v == nil {
        return Date()
    }
    
    switch v {
    case is Double:
        return Date(timeIntervalSince1970: (v as! Double) / 1e9)
    case is Int:
        return Date(timeIntervalSince1970: Double(v as! Int) / 1e9)
    case is String:
        return Date(timeIntervalSince1970: Double(v as! String)! / 1e9)
    default:
        return Date()
    }
}

