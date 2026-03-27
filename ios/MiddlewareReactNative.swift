import os

private enum OTLPHeaders {
    static func pairs(authorization accountKey: String) -> [(String, String)] {
        [
            ("Origin", "sdk.middleware.io"),
            ("Access-Control-Allow-Headers", "*"),
            ("Authorization", accountKey),
        ]
    }
}

@objc(MiddlewareReactNative)
class MiddlewareReactNative: NSObject {
    private var appStartTime = Date()
    private var otlpTraceExporter: OtlpHttpTraceExporter?
    private var otlpLogExporter: OtlpHttpLogExporter?
    private var globalAttributes: [String: Any] = [:]
    private var resourceAttributes: [String: Any] = [:]
    private var newGlobalAttributes: [String: AttributeValue] = [:]
    private var newResourceAttributes: [String: AttributeValue] = [:]
    private var resource: Resource?

    private static let logTagAttributes: [String: AttributeValue] = [
        "TAG": AttributeValue.string("MiddlewareReactNative"),
    ]

    private static let otlpTimeout: TimeInterval = 10_000

    @objc(initialize:withResolver:withRejecter:)
    func initialize(
        config: [String: Any],
        resolve: RCTPromiseResolveBlock,
        reject: RCTPromiseRejectBlock
    ) {
        do {
            appStartTime = try processStartTime()
        } catch {
            // Fall back to instance default `appStartTime` if sysctl fails.
        }

        guard let target = config["target"] as? String else {
            reject("error", "Missing target URL", nil)
            return
        }
        guard let accountKey = config["accountKey"] as? String else {
            reject("error", "Missing account key", nil)
            return
        }

        guard let globalAttrs = config["globalAttributes"] as? [String: Any],
              let resourceAttrs = config["resourceAttributes"] as? [String: Any] else {
            reject("error", "Invalid globalAttributes or resourceAttributes", nil)
            return
        }

        globalAttributes = globalAttrs
        resourceAttributes = resourceAttrs

        newGlobalAttributes = Globals.convertToAttributeValue(dictionary: globalAttributes)
        newResourceAttributes = Globals.convertToAttributeValue(dictionary: resourceAttributes)
        newResourceAttributes[ResourceAttributes.deviceModelName.rawValue] = AttributeValue.string(Device.current.description)
        // Match Android PackageInfo.versionName: marketing version only (no CFBundleVersion fallback).
        let shortRaw = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        let marketing = shortRaw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let appVersion = marketing.isEmpty ? "unknown" : marketing
        newResourceAttributes["app.version"] = AttributeValue.string(appVersion)

        Globals.setResourceAttributes(Globals.convertToString(newResourceAttributes))
        resource = Resource(attributes: newResourceAttributes)

        let headerPairs = OTLPHeaders.pairs(authorization: accountKey)
        let otlpConfig = OtlpConfiguration(timeout: Self.otlpTimeout, headers: headerPairs)

        let tracesURL = URL(string: target + "/v1/traces")
        let logsURL = URL(string: target + "/v1/logs")
        guard let tracesURL, let logsURL else {
            reject("error", "Invalid target URL", nil)
            return
        }

        otlpTraceExporter = OtlpHttpTraceExporter(
            endpoint: tracesURL,
            config: otlpConfig,
            envVarHeaders: headerPairs
        )
        otlpLogExporter = OtlpHttpLogExporter(
            endpoint: logsURL,
            config: otlpConfig,
            envVarHeaders: headerPairs
        )

        if let exporter = otlpTraceExporter {
            initializeCrashReporting(exporter: exporter, resource: resource!, attributes: newGlobalAttributes)
        }
        initializeNetworkTypeMonitoring()

        if config["sessionRecording"] as? String == "true" {
            startSessionRecordingIfNeeded(target: target, accountKey: accountKey)
        }

        resolve(["moduleStart": appStartTime.timeIntervalSince1970 * 1000])
    }

    /// Starts session recording only when the network is already up (same decision as the previous `canStart` / `cantStart` timer: no recording if offline at init).
    private func startSessionRecordingIfNeeded(target: String, accountKey: String) {
        guard NetworkReachability.isNetworkAvailable() else { return }

        let sessionStartTs = UInt64(Date().timeIntervalSince1970 * 1000)
        MessageCollector(target: target, token: accountKey).start()
        let captureSettings = getCaptureSettings(fps: 3, quality: "standard")
        ScreenshotManager.shared.setSettings(settings: captureSettings)
        ScreenshotManager.shared.start(startTs: sessionStartTs, target: target, token: accountKey)
    }

    @objc(export:withResolver:withRejecter:)
    func export(spans: [[String: Any]], resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        resolve(otlpTraceExporter?.export(spans: OtelTransform.toOtelSpans(spans: spans)))
    }

    @objc(nativeCrash)
    func nativeCrash() {
        print("Native crash")
        let x: Int? = nil
        print(x! as Any)
    }

    @objc(setSessionId:startTimeMs:withResolver:withRejecter:)
    func setSessionId(_ id: String, startTimeMs: Double, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        Globals.setSessionId(id)
        let startTimeString = String(Int64(startTimeMs.rounded()))
        var syncedResource = Globals.getResourceAttributes()
        syncedResource["session.id"] = id
        syncedResource["session.start_time"] = startTimeString
        Globals.setResourceAttributes(syncedResource)
        resourceAttributes["session.id"] = id
        resourceAttributes["session.start_time"] = startTimeString
        newResourceAttributes = Globals.convertToAttributeValue(dictionary: resourceAttributes)
        updateCrashReportSession(id, startTimeString)
        resolve(true)
    }

    @objc(setGlobalAttributes:withResolver:withRejecter:)
    func setGlobalAttributes(attributes: [String: Any], resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        setGlobalAttributesInternally(attributes: attributes)
        resolve(true)
    }

    @objc(info:withResolver:withRejecter:)
    func info(message: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        if #available(iOS 14.0, *) {
            emitPlatformLog(message: message, severity: .info) { logger, msg in logger.info("\(msg)") }
        }
        resolve(true)
    }

    @objc(error:withResolver:withRejecter:)
    func error(message: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        if #available(iOS 14.0, *) {
            emitPlatformLog(message: message, severity: .error) { logger, msg in logger.error("\(msg)") }
        }
        resolve(true)
    }

    @objc(debug:withResolver:withRejecter:)
    func debug(message: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        if #available(iOS 14.0, *) {
            emitPlatformLog(message: message, severity: .debug) { logger, msg in logger.debug("\(msg)") }
        }
        resolve(true)
    }

    @objc(warn:withResolver:withRejecter:)
    func warn(message: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        if #available(iOS 14.0, *) {
            emitPlatformLog(message: message, severity: .warn) { logger, msg in logger.warning("\(msg)") }
        }
        resolve(true)
    }

    private func setGlobalAttributesInternally(attributes: [String: Any]) {
        let stringAttribs: [String: String] = attributes.compactMapValues { value in
            switch value {
            case let s as String:
                return s
            case let b as Bool:
                return String(b)
            case let d as Double:
                return String(d)
            case let i as Int:
                return String(i)
            default:
                return nil
            }
        }
        Globals.setGlobalAttributes(stringAttribs)
    }

    private func processStartTime() throws -> Date {
        let name = "kern.proc.pid"
        var len: size_t = 4
        var mib = [Int32](repeating: 0, count: 4)
        var kp = kinfo_proc()
        try mib.withUnsafeMutableBufferPointer { mibBP in
            try name.withCString { nbp in
                guard sysctlnametomib(nbp, mibBP.baseAddress, &len) == 0 else {
                    throw POSIXError(.EAGAIN)
                }
            }
            mibBP[3] = getpid()
            len = MemoryLayout<kinfo_proc>.size
            guard sysctl(mibBP.baseAddress, 4, &kp, &len, nil, 0) == 0 else {
                throw POSIXError(.EAGAIN)
            }
        }
        let startTime = kp.kp_proc.p_un.__p_starttime
        let ti = TimeInterval(startTime.tv_sec) + TimeInterval(startTime.tv_usec) / 1_000_000
        return Date(timeIntervalSince1970: ti)
    }
}

@available(iOS 14.0, *)
private extension MiddlewareReactNative {
    private enum PlatformLog {
        static let logger = Logger(
            subsystem: Bundle.main.bundleIdentifier ?? "MiddlewareReactNative",
            category: "MiddlewareReactNative"
        )
    }

    func emitPlatformLog(
        message: String,
        severity: Severity,
        osLog: (Logger, String) -> Void
    ) {
        osLog(PlatformLog.logger, message)
        guard let resource else { return }
        let record = ReadableLogRecord(
            resource: resource,
            instrumentationScopeInfo: InstrumentationScopeInfo(),
            timestamp: Date(),
            severity: severity,
            body: .string(message),
            attributes: Self.logTagAttributes
        )
        otlpLogExporter?.export(logRecords: [record])
    }
}
