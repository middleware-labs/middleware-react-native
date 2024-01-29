fileprivate var spanExporter: SpanExporter? = nil

@objc(MiddlewareReactNative)
class MiddlewareReactNative: NSObject {
  private var appStartTime = Date()
  private var otlpTraceExporter: OtlpHttpTraceExporter? = nil
  private var globalAttributes: Dictionary<String, Any> = [:]
  @objc(initialize:withResolver:withRejecter:)
  func initialize(config: Dictionary<String, Any>, resolve:RCTPromiseResolveBlock,reject:RCTPromiseRejectBlock) -> Void {
     do {
         appStartTime = try processStartTime()
         print("Process appStartTime \(appStartTime)")
     } catch {
        //  ignore
     }

      let target = config["target"] as? String

      if target == nil {
          reject("error", "Missing target URL", nil)
          return
      }

      let accountKey = config["accountKey"] as? String

      if accountKey == nil {
          reject("error", "Missing account key", nil)
          return
      }
      var targetTrace = target!
      targetTrace += "/v1/traces"
      
      self.globalAttributes = config["globalAttributes"] as! [String: Any]

      otlpTraceExporter = OtlpHttpTraceExporter(
                  endpoint: URL(string: targetTrace)!,
                  config: OtlpConfiguration(timeout: TimeInterval(10000),
                                            headers: [
                                              ("Origin","sdk.middleware.io"),
                                              ("Access-Control-Allow-Headers", "*"),
                                              ("Authorization", accountKey!),
                                            ]
                                           ),
                  envVarHeaders: [
                    ("Origin","sdk.middleware.io"),
                    ("Access-Control-Allow-Headers", "*"),
                    ("Authorization", accountKey!),
                  ]
              )
      initializeCrashReporting(exporter: otlpTraceExporter!, attributes: globalAttributes)
      initializeNetworkTypeMonitoring()
      resolve(["moduleStart": appStartTime.timeIntervalSince1970 * 1000])
    }

    @objc(export:withResolver:withRejecter:)
    func export(spans: Array<Dictionary<String, Any>>, resolve:RCTPromiseResolveBlock,reject:RCTPromiseRejectBlock) -> Void {
        resolve(otlpTraceExporter?.export(spans: OtelTransform.toOtelSpans(spans: spans, attributes: self.globalAttributes)))
    }

    @objc(nativeCrash)
    func nativeCrash() -> Void {
        print("Native crash")
        let x: Int? = nil
        print(x! as Any);
    }

    @objc(setSessionId:withResolver:withRejecter:)
    func setSessionId(id: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        Globals.setSessionId(id)
        updateCrashReportSessionId(id)
        resolve(true)
    }
    
    @objc(setGlobalAttributes:withResolver:withRejecter:)
    func setGlobalAttributes(attributes: Dictionary<String, Any>, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        setGlobalAttributesInternally(attributes: attributes)
        resolve(true)
    }

    private func setGlobalAttributesInternally(attributes: Dictionary<String, Any>) {
        let newAttribs: [String: String] = attributes.compactMapValues { v in
            switch v {
            case is String:
                return v as! String
            case is Bool:
                return (v as! Bool).description
            case is Double:
                return (v as! Double).description
            case is Int:
                return (v as! Int).description
            default:
                return nil
            }
        }

        Globals.setGlobalAttributes(newAttribs)
    }

    private func processStartTime() throws -> Date {
        let name = "kern.proc.pid"
        var len: size_t = 4
        var mib = [Int32](repeating: 0, count: 4)
        var kp: kinfo_proc = kinfo_proc()
        try mib.withUnsafeMutableBufferPointer { (mibBP: inout UnsafeMutableBufferPointer<Int32>) throws in
            try name.withCString { (nbp: UnsafePointer<Int8>) throws in
                guard sysctlnametomib(nbp, mibBP.baseAddress, &len) == 0 else {
                    throw POSIXError(.EAGAIN)
                }
            }
            mibBP[3] = getpid()
            len =  MemoryLayout<kinfo_proc>.size
            guard sysctl(mibBP.baseAddress, 4, &kp, &len, nil, 0) == 0 else {
                throw POSIXError(.EAGAIN)
            }
        }
        // Type casts to finally produce the answer
        let startTime = kp.kp_proc.p_un.__p_starttime
        let ti: TimeInterval = Double(startTime.tv_sec) + (Double(startTime.tv_usec) / 1e6)
        return Date(timeIntervalSince1970: ti)
    }
}
