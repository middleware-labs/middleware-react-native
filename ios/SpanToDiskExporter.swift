

import Foundation
import DeviceKit

//class SpanToDiskExporter : SpanExporter {
//    let db: SpanDb
//    let maxFileSizeBytes: Int64
//    // Count of spans to insert before checking whether truncation is necessary
//    let truncationCheckpoint: Int64
//    let deviceModel: String
//    private var totalSpansInserted: Int64 = 0
//    private var checkpointCounter: Int64 = 0
//
//    init(spanDb: SpanDb, limitDiskUsageMegabytes: Int64, truncationCheckpoint: Int64) {
//        self.db = spanDb
//        self.maxFileSizeBytes = limitDiskUsageMegabytes * 1024 * 1024
//        self.truncationCheckpoint = truncationCheckpoint
//        self.deviceModel = Device.current.description
//    }
//
//    public func shutdown() {}
//
//    public func export(spans: [Dictionary<String, Any>]) -> Bool {
//
//        if !db.ready() {
//            return false
//        }
//
////        let otelSpans = OtelTransform.toOtelSpans(spans: spans)
//        return export(otelSpans)
//    }
//
//    public func export(_ otelSpans: [OtelSpan]) -> Bool {
//        let globalAttribs = Globals.getGlobalAttributes()
//        let sessionId = Globals.getSessionId()
//        
//        let networkInfo = getNetworkInfo()
////        let body = Opentelemetry_Proto_Collector_Trace_V1_ExportTraceServiceRequest.with {
////              $0.resourceSpans = SpanAdapter.toProtoResourceSpans(spanDataList: sendingSpans)
////            }
//        for span in otelSpans {
//            if span.attributes["middleware.rumSessionId"] == nil && !sessionId.isEmpty {
//                span.attributes["middleware.rumSessionId"] = sessionId
//            }
//
//            if span.attributes["device.model.name"] == nil {
//                span.attributes["device.model.name"] = self.deviceModel
//            }
//
//            if networkInfo.hostConnectionType != nil {
//                span.attributes["net.host.connection.type"] = networkInfo.hostConnectionType!
//            }
//
//            if networkInfo.hostConnectionSubType != nil {
//                span.attributes["net.host.connection.subtype"] = networkInfo.hostConnectionSubType!
//            }
//
//            if networkInfo.carrierName != nil {
//                span.attributes["net.host.carrier.name"] = networkInfo.carrierName!
//            }
//
//            if networkInfo.carrierCountryCode != nil {
//                span.attributes["net.host.carrier.mcc"] = networkInfo.carrierCountryCode!
//            }
//
//            if networkInfo.carrierNetworkCode != nil {
//                span.attributes["net.host.carrier.mnc"] = networkInfo.carrierNetworkCode!
//            }
//
//            if networkInfo.carrierIsoCountryCode != nil {
//                span.attributes["net.host.carrier.icc"] = networkInfo.carrierIsoCountryCode!
//            }
//            
//            for (key, attrib) in globalAttribs {
//                if span.attributes[key] == nil {
//                    span.attributes[key] = attrib
//                }
//            }
//        }
//
//        if !db.store(spans: otelSpans) {
//            return true
//        }
//
//        let inserted = Int64(otelSpans.count)
//        checkpointCounter += inserted
//
//        // There might be a case where truncation checkpoint is never reached,
//        // so do a size check / truncation after the first insert.
//        if totalSpansInserted == 0 || checkpointCounter >= truncationCheckpoint {
//            maybeTruncate()
//        }
//
//        totalSpansInserted += inserted
//
//        return true
//    }
//
//    private func maybeTruncate() {
//        guard let dbSize = db.getSize() else {
//            return
//        }
//
//        if dbSize < self.maxFileSizeBytes {
//            return
//        }
//
//        _ = db.truncate()
//
//        checkpointCounter = 0
//    }
//}
