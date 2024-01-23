import Foundation
import System
import UIKit

internal class DeviceStats {
    class var batteryLevel: String {
        UIDevice.current.isBatteryMonitoringEnabled = true
        let level = abs(UIDevice.current.batteryLevel * 100)
        return "\(level)%"
    }
    class var freeDiskSpace: String {
        do {
            let systemAttributes = try FileManager.default.attributesOfFileSystem(forPath: NSHomeDirectory() as String)
            let maybeFreeSpace = (systemAttributes[FileAttributeKey.systemFreeSize] as? NSNumber)?.int64Value
            guard let freeSpace = maybeFreeSpace else {
                return "Unknown"
            }
            return ByteCountFormatter.string(fromByteCount: freeSpace, countStyle: .file)
        } catch {
            return "Unknown"
        }
    }
    // https://stackoverflow.com/questions/5012886/determining-the-available-amount-of-ram-on-an-ios-device/8540665#8540665
    class var freeMemory: String {
        var usedBytes: Float = 0
        let totalBytes = Float(ProcessInfo.processInfo.physicalMemory)
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size) / 4
        let kerr: kern_return_t = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: 1) {
                task_info(
                        mach_task_self_,
                        task_flavor_t(MACH_TASK_BASIC_INFO),
                        $0,
                        &count
                )
            }
        }
        if kerr == KERN_SUCCESS {
            usedBytes = Float(info.resident_size)
        } else {
            return "Unknown"
        }
        let freeBytes = totalBytes - usedBytes
        return ByteCountFormatter.string(fromByteCount: Int64(freeBytes), countStyle: .memory)
    }

}
