import Foundation

class BandwidthTracker {
    private let maxSamples: Int
    private let timeWindowNanos: UInt64
    private var samples: [(Int, UInt64)] = []

    init(timeWindowMillis: UInt64 = 30_000, maxSamples: Int = 60) {
        self.maxSamples = maxSamples
        self.timeWindowNanos = timeWindowMillis * 1_000_000
    }

    func add(bytes: Int, timeNanos: UInt64) {
        if samples.count >= maxSamples {
            samples.removeFirst()
        }

        samples.append((bytes, timeNanos))
    }

    /// Returns bandwidth in KiB/s
    func bandwidth(timeNanosNow: UInt64) -> Double {
        let samplesInWindow = samples.filter { (_, ts) in
            timeNanosNow >= ts && timeNanosNow - ts <= timeWindowNanos
        }

        if samplesInWindow.isEmpty {
            return 0.0
        }

        let transferredBytes = samplesInWindow.reduce(0, { total, sample in
            let (bytes, _) = sample
            return total + bytes
        })

        let beginTime = timeNanosNow >= timeWindowNanos ? timeNanosNow - timeWindowNanos : 0
        let intervalSeconds = Double(timeNanosNow - beginTime) / 1e9
        return Double(transferredBytes) / 1024.0 / intervalSeconds
    }
}
