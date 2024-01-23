
import Foundation

let MAX_CONTENT_LENGTH = 1024 * 512
let MAX_BANDWIDTH_KB_PER_SECOND = 15.0

fileprivate struct Payload {
    let content: Data
    let ids: [Int64]
}

fileprivate func preparePayload(spans: [(Int64, String)], contentLengthLimit: Int) -> Payload {
    var ids: [Int64] = []
    var payloadSpans: [String] = []
    var contentLength = 0

    for (id, spanJson) in spans {
        let length = spanJson.utf8.count + 1 // Include the comma separator
        if contentLength + length <= MAX_CONTENT_LENGTH {
            ids.append(id)
            payloadSpans.append(spanJson)
            contentLength += length
        }
    }

    let data = """
    {
        "resourceSpans": [
            {
                "resource": {},
                "scopeSpans": [
                    {
                        "scope": {
                            "name": "mwNative"
                        },
                        "spans": [
                            \(payloadSpans.joined(separator: ","))
                        ]
                    }
                ]
            }
        ]
    }
    """
    
    let content = Data(data.utf8)
    return Payload(content: content, ids: ids)
}

fileprivate func shouldEraseSpans(_ response: URLResponse?) -> Bool {
    if response == nil {
        return true
    }

    let resp = response as? HTTPURLResponse

    if resp == nil {
        return true
    }

    switch resp!.statusCode {
    case 200...399:
        return true
    case 400, // bad request
         406, // not acceptable
         413, // payload too large
         422: // unprocessable entity
        return true
    default:
        return false
    }
}

fileprivate func buildRequest(url: URL, data: Data, accountKey: String) -> URLRequest {
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.addValue("application/json", forHTTPHeaderField: "Content-Type")
    
    req.addValue("MW_API_KEY", forHTTPHeaderField: accountKey)
    req.httpBody = data
    return req
}

class SpanFromDiskExport {
    @discardableResult static func start(spanDb: SpanDb, endpoint: String, accountKey: String) -> (() -> Void) {
        guard let url = URL(string: endpoint) else {
            print("SpanFromDiskExport: malformed target URL: \(endpoint)")
            return {}
        }

        var isRunning = true
        let stopSem = DispatchSemaphore(value: 0)
        let stop: () -> Void = {
            isRunning = false
            stopSem.wait()
        }

        let bandwidthTracker = BandwidthTracker()

        var processSpans: (() -> Void)!
        processSpans = {
            var loopDelayMs: Int = 5_000
            var bytesSent: Int = 0

            defer {
                bandwidthTracker.add(bytes: bytesSent, timeNanos: DispatchTime.now().rawValue)

                if isRunning {
                    DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(loopDelayMs), execute: {
                        processSpans()
                    })
                } else {
                    stopSem.signal()
                }
            }

            let bw = bandwidthTracker.bandwidth(timeNanosNow: DispatchTime.now().rawValue)
            if bw > MAX_BANDWIDTH_KB_PER_SECOND {
                loopDelayMs = 1_000
                return
            }

            let spans = spanDb.fetch(count: 64)

            if spans.isEmpty {
                return
            }

            
            let payload = preparePayload(spans: spans, contentLengthLimit: MAX_CONTENT_LENGTH)
            let req = buildRequest(url: url, data: payload.content, accountKey: accountKey)

            let sem = DispatchSemaphore(value: 0)

            var shouldErase = false
            let task = URLSession.shared.dataTask(with: req) { _, resp, error in
                // Error might even be nil when the error code clearly is not
                if error == nil && shouldEraseSpans(resp) {
                    shouldErase = true
                    // In case of a successful upload, go for another round.
                    // We are limited by bandwidth anyway, this provides an upload burst.
                    loopDelayMs = 50
                } else {
                    print("Failed to upload spans: \(error.debugDescription)")
                }
                bytesSent = payload.content.count

                sem.signal()
            }
            task.resume()
            sem.wait()

            if shouldErase {
                _ = spanDb.erase(ids: payload.ids)
            }
        }

        DispatchQueue.global().async {
            processSpans()
        }

        return stop
    }
}
