// Copyright © 2023 Middleware. Licensed under the Apache License, Version 2.0

import Foundation
import MiddlewareRum

/**
 * Thin bridge over the stable MiddlewareRum iOS SDK (>= 2.1).
 *
 * The JS layer owns tracing (spans arrive via `export`), the session id
 * (pushed via `setSessionId` -> MiddlewareRum.setNativeSession), and screen
 * names (pushed via `setScreenName`). The native SDK provides the OTLP
 * pipeline, crash reporting, network monitoring, slow rendering, and v3
 * session recording.
 */
@objc(MiddlewareReactNative)
class MiddlewareReactNative: NSObject {

    @objc(initialize:withResolver:withRejecter:)
    func initialize(config: NSDictionary, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        guard let target = config["target"] as? String,
              let accountKey = config["accountKey"] as? String,
              let serviceName = config["serviceName"] as? String,
              let projectName = config["projectName"] as? String else {
            reject("MiddlewareReactNative Error",
                   "Initialize: target, accountKey, serviceName or projectName missing", nil)
            return
        }

        let builder = MiddlewareRumBuilder()
            .target(target)
            .rumAccessToken(accountKey)
            .serviceName(serviceName)
            .projectName(projectName)
            // JS owns app-start/screen tracking and tap capture; native
            // crash/network/slow-rendering/v3-recording stay on.
            .disableUIInstrumentation()
            .disableAppLifcycleInstrumentation()

        if let environment = config["deploymentEnvironment"] as? String {
            _ = builder.deploymentEnvironment(environment)
        }
        var globalAttributes = (config["globalAttributes"] as? [String: Any]) ?? [:]
        // JS resource attributes (telemetry.sdk.*) ride on exported spans via
        // exportRawSpans; surface them on native spans as global attrs too.
        if let resourceAttributes = config["resourceAttributes"] as? [String: Any] {
            globalAttributes.merge(resourceAttributes) { current, _ in current }
        }
        if !globalAttributes.isEmpty {
            _ = builder.globalAttributes(globalAttributes)
        }
        if let ratio = config["sessionSamplingRatio"] as? Double {
            _ = builder.sessionSamplingRatio(samplingRatio: ratio)
        }
        if (config["sessionRecording"] as? String) != "true" {
            _ = builder.disableRecording()
        }
        if config["disableSessionRecordingV3"] as? Bool == true {
            _ = builder.disableSessionRecordingV3()
        }
        if let recordingOptions = config["recordingOptions"] as? [String: Any] {
            _ = builder.recordingOptions(mapRecordingOptions(recordingOptions))
        }

        // Inject the JS-owned session BEFORE build() so the native SDK never
        // creates its own session (a phantom session would otherwise hold the
        // pre-injection native telemetry and trigger session.id.change).
        if let resourceAttributes = config["resourceAttributes"] as? [String: Any],
           let sessionId = resourceAttributes["session.id"] as? String,
           let startTimeMs = resourceAttributes["session.start_time"] as? NSNumber {
            MiddlewareRum.setNativeSession(sessionId, startTimeMs: startTimeMs.doubleValue)
        }

        // v3 session recording starts inside build() (sampler-gated).
        if !builder.build() {
            reject("MiddlewareReactNative Error", "Initialize: MiddlewareRum failed to start", nil)
            return
        }

        let appStart = ((try? processStartTime()) ?? Date()).timeIntervalSince1970 * 1000
        resolve([
            "appStart": appStart,
            "moduleStart": appStart,
            "isColdStart": true,
        ] as [String: Any])
    }

    @objc(export:withResolver:withRejecter:)
    func export(spans: NSArray, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        guard let spanDicts = spans as? [[String: Any]] else {
            reject("MiddlewareReactNative Error", "Export: invalid span payload", nil)
            return
        }
        resolve(MiddlewareRum.exportRawSpans(spanDicts))
    }

    @objc(setSessionId:startTimeMs:withResolver:withRejecter:)
    func setSessionId(_ sessionId: NSString, startTimeMs: Double, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        MiddlewareRum.setNativeSession(sessionId as String, startTimeMs: startTimeMs)
        resolve(true)
    }

    @objc(setScreenName:)
    func setScreenName(_ name: NSString) {
        DispatchQueue.main.async {
            MiddlewareRum.setScreenName(name as String)
        }
    }

    /// Starts session recording, overriding both `sessionRecording: false` and the
    /// session sampler. Sticky until `stopRecording` is called.
    @objc(startRecording:withRejecter:)
    func startRecording(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        resolve(onMainSync {
            MiddlewareRum.startRecording()
            return MiddlewareRum.isRecording()
        })
    }

    /// Stops session recording. Sticky across session rotation until `startRecording`.
    @objc(stopRecording:withRejecter:)
    func stopRecording(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        resolve(onMainSync {
            MiddlewareRum.stopRecording()
            return !MiddlewareRum.isRecording()
        })
    }

    @objc(isRecording:withRejecter:)
    func isRecording(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        resolve(MiddlewareRum.isRecording())
    }

    /// MiddlewareRum applies recording state on the main thread, but RN runs module
    /// methods on its own serial queue. Hop to main and wait so the promise resolves
    /// with the settled state instead of a stale one.
    private func onMainSync<T>(_ work: () -> T) -> T {
        if Thread.isMainThread {
            return work()
        }
        return DispatchQueue.main.sync(execute: work)
    }

    @objc(setGlobalAttributes:withResolver:withRejecter:)
    func setGlobalAttributes(attributes: NSDictionary, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        MiddlewareRum.setGlobalAttributes((attributes as? [String: Any]) ?? [:])
        resolve(true)
    }

    @objc(nativeCrash)
    func nativeCrash() {
        let values: [Int] = []
        _ = values[7] // deliberate out-of-bounds crash for testing
    }

    @objc(debug:withResolver:withRejecter:)
    func debug(message: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        MiddlewareRum.debug(message as String)
        resolve(true)
    }

    @objc(info:withResolver:withRejecter:)
    func info(message: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        MiddlewareRum.info(message as String)
        resolve(true)
    }

    @objc(warn:withResolver:withRejecter:)
    func warn(message: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        MiddlewareRum.warning(message as String)
        resolve(true)
    }

    @objc(error:withResolver:withRejecter:)
    func error(message: NSString, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        MiddlewareRum.error(message as String)
        resolve(true)
    }

    private func mapRecordingOptions(_ map: [String: Any]) -> RecordingOptions {
        let options = RecordingOptions()
        switch (map["frequency"] as? String)?.lowercased() {
        case "high": options.setFrequency(.high)
        case "standard": options.setFrequency(.standard)
        case "low": options.setFrequency(.low)
        default: break
        }
        switch (map["quality"] as? String)?.lowercased() {
        case "high": options.setQuality(.High)
        case "standard": options.setQuality(.Standard)
        case "low": options.setQuality(.Low)
        default: break
        }
        if let mask = map["maskAllTextInputs"] as? Bool {
            options.setMaskAllTextInputs(mask)
        }
        if let mask = map["maskAllImages"] as? Bool {
            options.setMaskAllImages(mask)
        }
        return options
    }

    /// Real process start time via sysctl, for the JS AppStart span.
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
