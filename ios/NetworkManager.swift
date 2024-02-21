// Copyright © 2023 Middleware. Licensed under the Apache License, Version 2.0
#if os(iOS) || targetEnvironment(macCatalyst) || os(tvOS)
import UIKit
import SWCompression

let IMAGES_URL = "/v1/rum"

class NetworkManager: NSObject {
    public var baseUrl: String? = nil
    
    public var sessionId: String? = nil
    private var token: String? = nil
    
    init(target: String, token: String) {
        self.baseUrl = target
        self.token = token
    }

    private func createRequest(method: String, path: String) -> URLRequest {
        let url = URL(string: self.baseUrl!+path)!
        var request = URLRequest(url: url)
        request.httpMethod = method
        return request
    }

    private func callAPI(request: URLRequest,
                 onSuccess: @escaping (Data) -> Void,
                 onError: @escaping (Error?) -> Void) {
    
        let task = URLSession.shared.dataTask(with: request) { (data, response, error) in
            DebugUtils.log(">>>\(request.httpMethod ?? ""):\(request.url?.absoluteString ?? "")\n<<<\(String(data: data ?? Data(), encoding: .utf8) ?? "")")
            
            DispatchQueue.main.async {
                guard let data = data,
                      let httpResponse = response as? HTTPURLResponse,
                      (200...299).contains(httpResponse.statusCode) else {
                    DebugUtils.error(">>>>>> Error in call \(request.url?.absoluteString ?? "") : \(error?.localizedDescription ?? "N/A")")
                    onError(error)
                    return
                }
                onSuccess(data)
            }
        }
        task.resume()
    }
    
    
    func sendImages(sessionId: String, images: Data, name: String, completion: @escaping (Bool) -> Void) {
        var request = createRequest(method: "POST", path: IMAGES_URL)
        guard let token = self.token else {
            completion(false)
            return
        }
        request.setValue("\(token)", forHTTPHeaderField: "Authorization")
        let boundary = "Boundary-\(NSUUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        let parameters = ["sessionId": sessionId]
        for (key, value) in parameters {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n")
            body.appendString("\(value)\r\n")
        }

        body.appendString("--\(boundary)\r\n")
        body.appendString("Content-Disposition: form-data; name=\"batch\"; filename=\"\(name)\"\r\n")
        body.appendString("Content-Type: gzip\r\n\r\n")
        body.append(images)
        body.appendString("\r\n")

        body.appendString("--\(boundary)--\r\n")
        DebugUtils.log(">>>>>> sending \(body.count) bytes")
        request.httpBody = body

        callAPI(request: request) { (data) in
            completion(true)
        } onError: { _ in
            completion(false)
        }
    }
}
#endif
