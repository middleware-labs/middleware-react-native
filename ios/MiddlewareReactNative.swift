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
    func initialize(config: NSDictionary,
                    resolve: @escaping RCTPromiseResolveBlock,
                    reject: @escaping RCTPromiseRejectBlock) {
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
        if let recordingOptions = config["recordingOptions"] as? [String: Any] {
            _ = builder.recordingOptions(mapRecordingOptions(recordingOptions))
        }

        // sysctl-derived, so it is unaffected by the dispatch below.
        let appStart = ((try? processStartTime()) ?? Date()).timeIntervalSince1970 * 1000

        // build() registers application/notification observers and starts the
        // v3 recorder, all of which UIKit requires on the main thread. React
        // Native dispatches module methods on its own queue (and, under
        // bridgeless, straight from the JS thread), so hop explicitly —
        // otherwise initialization dies with "Method addObserver must be
        // called on the main thread" and every later export is rejected by an
        // exporter that was never created.
        onMain {
            // Inject the JS-owned session BEFORE build() so the native SDK never
            // creates its own session (a phantom session would otherwise hold the
            // pre-injection native telemetry and trigger session.id.change).
            if let resourceAttributes = config["resourceAttributes"] as? [String: Any],
               let sessionId = resourceAttributes["session.id"] as? String,
               let startTimeMs = resourceAttributes["session.start_time"] as? NSNumber {
                MiddlewareRum.setNativeSession(sessionId, startTimeMs: startTimeMs.doubleValue)
            }

            // v3 session recording starts inside build() (sampler-gated).
            guard builder.build() else {
                reject("MiddlewareReactNative Error", "Initialize: MiddlewareRum failed to start", nil)
                return
            }

            resolve([
                "appStart": appStart,
                "moduleStart": appStart,
                "isColdStart": true,
            ] as [String: Any])
        }
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
    func startRecording(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        onMain {
            MiddlewareRum.startRecording()
            resolve(MiddlewareRum.isRecording())
        }
    }

    /// Stops session recording. Sticky across session rotation until `startRecording`.
    @objc(stopRecording:withRejecter:)
    func stopRecording(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        onMain {
            MiddlewareRum.stopRecording()
            resolve(!MiddlewareRum.isRecording())
        }
    }

    @objc(isRecording:withRejecter:)
    func isRecording(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        onMain {
            resolve(MiddlewareRum.isRecording())
        }
    }

    /// Runs `work` on the main thread, where MiddlewareRum registers its observers
    /// and drives the recorder. React Native runs module methods on its own queue.
    ///
    /// Deliberately async rather than `DispatchQueue.main.sync`: under bridgeless
    /// these methods can be invoked straight from the JS thread, and a synchronous
    /// hop deadlocks whenever the main thread is itself waiting on JS. The promise
    /// still resolves with the settled state because it resolves inside the hop.
    private func onMain(_ work: @escaping () -> Void) {
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
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
