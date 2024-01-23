import Foundation
import CrashReporter

var TheCrashReporter: PLCrashReporter?
private var customDataDictionary = RWLocked<[String: String]>(initialValue: [:])
private var spanExporter: SpanExporter? = nil

func initializeCrashReporting(exporter: SpanExporter) {
    spanExporter = exporter
    var startupSpan = newSpan(name: "CrashReportingInit")
    var attributes: [String: AttributeValue] = [:]
    attributes["component"] = AttributeValue("appstart")
    defer {
        endSpan(exporter: spanExporter!, startupSpan)
    }
    let config = PLCrashReporterConfig(signalHandlerType: .BSD, symbolicationStrategy: PLCrashReporterSymbolicationStrategy(rawValue: 0) /* none */)
    let crashReporter_ = PLCrashReporter(configuration: config)
    if crashReporter_ == nil {
        attributes["error.message"] = AttributeValue("Cannot construct PLCrashReporter")
        print("Cannot construct PLCrashReporter")
        return
    }
    let crashReporter = crashReporter_!
    updateCrashReportSessionId(Globals.getSessionId())
    let success = crashReporter.enable()
    print("PLCrashReporter enabled: "+success.description)
    if !success {
        attributes["error.message"] = AttributeValue("Cannot enable PLCrashReporter")
        startupSpan.settingTotalAttributeCount(attributes.count)
        startupSpan.settingAttributes(attributes)
        return
    }
    TheCrashReporter = crashReporter
    updateDeviceStats()
    startPollingForDeviceStats()
    // Now for the pending report if there is one
    if !crashReporter.hasPendingCrashReport() {
        print("no crash report")
        return
    }
    print("Had a pending crash report")
    do {
        let data = crashReporter.loadPendingCrashReportData()
        try loadPendingCrashReport(data)
    } catch {
        print("Error loading crash report: \(error)")
        attributes["error.message"] = AttributeValue("Cannot load crash report")
        // yes, fall through to purge
    }
    startupSpan.settingTotalAttributeCount(attributes.count)
    startupSpan.settingAttributes(attributes)
    crashReporter.purgePendingCrashReport()

}

func updateCrashReportSessionId(_ id: String) {
   do {
       customDataDictionary.with_write_access { dict in
           dict["sessionId"] = id
       }

       if TheCrashReporter != nil {
           let customData = try NSKeyedArchiver.archivedData(
               withRootObject: customDataDictionary.read(),
                requiringSecureCoding: false
           )
           TheCrashReporter?.customData = customData
       }
   } catch {
        // We have failed to archive the custom data dictionary.
        print("Failed to add the sessionId to the crash reports custom data.")
   }
}

private func updateDeviceStats() {
    do {
        customDataDictionary.with_write_access { dict in
            dict["batteryLevel"] = DeviceStats.batteryLevel
            dict["freeDiskSpace"] = DeviceStats.freeDiskSpace
            dict["freeMemory"] = DeviceStats.freeMemory
        }
        let customData = try NSKeyedArchiver.archivedData(
            withRootObject: customDataDictionary.read(),
            requiringSecureCoding: false
        )
        TheCrashReporter?.customData = customData
    } catch {
        // We have failed to archive the custom data dictionary.
        print("Failed to add the device stats to the crash reports custom data.")
    }
}

/*
 Will poll every 5 seconds to update the device stats.
 */
private func startPollingForDeviceStats() {
    let repeatSeconds: Double = 5
    DispatchQueue.global(qos: .background).async {
        let timer = Timer.scheduledTimer(withTimeInterval: repeatSeconds, repeats: true) { _ in
            updateDeviceStats()
        }
        timer.fire()
    }
}

func loadPendingCrashReport(_ data: Data!) throws {
    print("Loading crash report of size \(data?.count as Any)")
    let report = try PLCrashReport(data: data)
    var exceptionType = report.signalInfo.name
    if report.hasExceptionInfo {
        exceptionType = report.exceptionInfo.exceptionName
    }
    // Turn the report into a span
    var span = newSpan(name: exceptionType ?? "unknown")
    var attributes: [String: AttributeValue] = [
        "component": AttributeValue("crash"),
        "crash.app.version" : AttributeValue(
            report.applicationInfo.applicationMarketingVersion),
        "error" : AttributeValue(true),
        "exception.type" : AttributeValue(exceptionType ?? "unknown"),
        "crash.address" : AttributeValue(report.signalInfo.address.description),
    ]
    

    if report.customData != nil {
        let customData = NSKeyedUnarchiver.unarchiveObject(with: report.customData) as? [String: String]
        if customData != nil {
            attributes["crash.rumSessionId"] =  AttributeValue(customData!["sessionId"] ?? "")
            
            attributes["crash.batteryLevel"] =  AttributeValue(customData!["batteryLevel"] ?? "0")
            
            attributes["crash.freeDiskSpace"] =  AttributeValue(customData!["freeDiskSpace"] ?? "0")
            
    
            attributes["crash.freeMemory"] =  AttributeValue(customData!["freeMemory"] ?? "0")
        } else {
            attributes["crash.rumSessionId"] =  AttributeValue( String(decoding: report.customData, as: UTF8.self))
        }
    }
    // "marketing version" here matches up to our use of CFBundleShortVersionString
    
    span.settingEvents([SpanData.Event(name: "crash.timestamp", timestamp: anyToTimestamp(report.systemInfo.timestamp))])
    for case let thread as PLCrashReportThreadInfo in report.threads where thread.crashed {
        attributes["exception.stacktrace"] =  AttributeValue(crashedThreadToStack(report: report, thread: thread))
        break
    }
    if report.hasExceptionInfo {
        attributes["exception.type"] =  AttributeValue(report.exceptionInfo.exceptionName)
        attributes["exception.message"] =  AttributeValue(report.exceptionInfo.exceptionReason)
    }
    span.settingAttributes(attributes)
    
    endSpan(exporter: spanExporter!, span)
}

// FIXME this is a messy copy+paste of select bits of PLCrashReportTextFormatter
func crashedThreadToStack(report: PLCrashReport, thread: PLCrashReportThreadInfo) -> String {
    let text = NSMutableString()
    text.appendFormat("Thread %ld", thread.threadNumber)
    var frameNum = 0
    while frameNum < thread.stackFrames.count {
        let str = formatStackFrame(
            // swiftlint:disable:next force_cast
            frame: thread.stackFrames[frameNum] as! PLCrashReportStackFrameInfo,
            frameNum: frameNum,
            report: report)
        text.append(str)
        text.append("\n")
        frameNum += 1
    }
    return String(text)
}

func formatStackFrame(frame: PLCrashReportStackFrameInfo, frameNum: Int, report: PLCrashReport) -> String {
    var baseAddress: UInt64 = 0
    var pcOffset: UInt64 = 0
    var imageName = "???"
    var symbolString: String?
    let imageInfo = report.image(forAddress: frame.instructionPointer)
    if imageInfo != nil {
        imageName = imageInfo!.imageName
        imageName = URL(fileURLWithPath: imageName).lastPathComponent
        baseAddress = imageInfo!.imageBaseAddress
        pcOffset = frame.instructionPointer - imageInfo!.imageBaseAddress
    }
    if frame.symbolInfo != nil {
        let symbolName = frame.symbolInfo.symbolName
        let symOffset = frame.instructionPointer - frame.symbolInfo.startAddress
        symbolString =  String(format: "%@ + %ld", symbolName!, symOffset)
    } else {
        symbolString = String(format: "0x%lx + %ld", baseAddress, pcOffset)
    }
    return String(format: "%-4ld%-35@ 0x%016lx %@", frameNum, imageName, frame.instructionPointer, symbolString!)
}
