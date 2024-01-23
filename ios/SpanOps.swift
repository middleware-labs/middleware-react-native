
import Foundation

fileprivate func randomPart() -> UInt64 {
    return UInt64.random(in: 1 ... .max)
}

fileprivate func traceId() -> String {
    return String(format: "%016llx%016llx", randomPart(), randomPart())
}

fileprivate func spanId() -> String {
    return String(format: "%016llx", randomPart())
}

fileprivate func timestamp() -> UInt64 {
    return UInt64(Date().timeIntervalSince1970 * 1e6)
}


//protocol SpanExporter: AnyObject {
//    func export(_ otelSpans: [OtelSpan]) -> Bool
//    func export(spans: [Dictionary<String, Any>]) -> Bool
//}
//
//class NoopExporter: SpanExporter {
//    func export(_ otelSpans: [OtelSpan]) -> Bool {
//        return true
//    }
//    
//    func export(spans: [Dictionary<String, Any>]) -> Bool {
//        return true
//    }
//}
//
//func newSpan(name: String) -> OtelSpan {
//    return OtelSpan(
//    traceId: traceId(),
//    parentId: nil,
//    spanId: spanId(),
//    kind: nil,
//    name: name,
//    startTime: timestamp(),
//    duration: nil,
//    attributes: [:],
//    events: [])
//}
//
//func endSpan(exporter: SpanExporter, _ span: OtelSpan) {
//    span.duration = timestamp() - span.startTime
//    _ = exporter.export([span])
//}
