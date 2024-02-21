// Copyright © 2023 Middleware. Licensed under the Apache License, Version 2.0

#if os(iOS) || targetEnvironment(macCatalyst) || os(tvOS)
import UIKit
import Foundation
import SwiftUI
import SWCompression

@objc public enum RecordingQuality: Int {
    case Low
    case Standard
    case High
}

// MARK: - screenshot manager
open class ScreenshotManager {
    public static let shared = ScreenshotManager()
    private let messagesQueue = OperationQueue()

    private var timer: Timer?
    private var sendTimer: Timer?

    private var sanitizedElements: [Sanitizable] = []
    private var observedInputs: [UITextField] = []
    private var screenshots: [Data] = []
    private var lastIndex = 0
    // MARK: capture settings
    // should we blur out sensitive views, or place a solid box on top
    private var isBlurMode = true
    private var blurRadius = 2.5
    // this affects how big the image will be compared to real phone screan.
    // we also can use default UIScreen.main.scale which is around 3.0 (dense pixel screen)
    private var screenScale = 1.25
    private var settings: (captureRate: Double, imgCompression: Double) = (captureRate: 0.33, imgCompression: 0.5)
    

    private var target: String?
    private var token: String?
    
    private init() {}

    func start(target: String?, token: String?) {
        self.target = target
        self.token = token
        startTakingScreenshots(every: settings.captureRate)
    }
    
    func setSettings(settings: (captureRate: Double, imgCompression: Double)) {
        self.settings = settings
    }
    
    func stop() {
        self.timer?.invalidate()
        self.timer = nil
        lastIndex = 0
        screenshots.removeAll()
    }
    
    func startTakingScreenshots(every interval: TimeInterval) {
        takeScreenshot()
        DispatchQueue.main.async {
            self.timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
                self?.takeScreenshot()
            }
        }
    }

    public func addSanitizedElement(_ element: Sanitizable) {
#if DEBUG
        DebugUtils.log("addSanitizedElement")
        #endif
        sanitizedElements.append(element)
    }

    public func removeSanitizedElement(_ element: Sanitizable) {
#if DEBUG
        DebugUtils.log("removeSanitizedElement")
        #endif
        sanitizedElements.removeAll { $0 as AnyObject === element as AnyObject }
    }

    // MARK: - UI Capturing
    func takeScreenshot() {
        let window = UIApplication.shared.windows.first { $0.isKeyWindow }
        let size = window?.frame.size ?? CGSize.zero
        UIGraphicsBeginImageContextWithOptions(size, false, screenScale)
        guard let context = UIGraphicsGetCurrentContext() else { return }

        // Rendering current window in custom context
        // 2nd option looks to be more precise
//      window?.layer.render(in: context)
//         #warning("Can slow down the app depending on complexity of the UI tree")
        window?.drawHierarchy(in: window?.bounds ?? CGRect.zero, afterScreenUpdates: false)
        
        // MARK: sanitize
        // Sanitizing sensitive elements
        if isBlurMode {
            let stripeWidth: CGFloat = 5.0
            let stripeSpacing: CGFloat = 15.0
            let stripeColor: UIColor = .gray.withAlphaComponent(0.7)
            
            for element in sanitizedElements {
                if let frame = element.frameInWindow {
                    let totalWidth = frame.size.width
                    let totalHeight = frame.size.height
                    let convertedFrame = CGRect(
                        x: frame.origin.x,
                        y: frame.origin.y,
                        width: frame.size.width,
                        height: frame.size.height
                    )
                    let cropFrame = CGRect(
                        x: frame.origin.x * screenScale,
                        y: frame.origin.y * screenScale,
                        width: frame.size.width * screenScale,
                        height: frame.size.height * screenScale
                    )
                    if let regionImage = UIGraphicsGetImageFromCurrentImageContext()?.cgImage?.cropping(to: cropFrame) {
                        let imageToBlur = UIImage(cgImage: regionImage, scale: screenScale, orientation: .up)
                        let blurredImage = imageToBlur.applyBlurWithRadius(blurRadius)
                        blurredImage?.draw(in: convertedFrame)
                        
                        context.saveGState()
                        UIRectClip(convertedFrame)

                        // Draw diagonal lines within the clipped region
                        for x in stride(from: -totalHeight, to: totalWidth, by: stripeSpacing + stripeWidth) {
                            context.move(to: CGPoint(x: x + convertedFrame.minX, y: convertedFrame.minY))
                            context.addLine(to: CGPoint(x: x + totalHeight + convertedFrame.minX, y: totalHeight + convertedFrame.minY))
                        }

                        context.setLineWidth(stripeWidth)
                        stripeColor.setStroke()
                        context.strokePath()
                        context.restoreGState()
                        
                        #if DEBUG
                        context.setStrokeColor(UIColor.black.cgColor)
                        context.setLineWidth(1)
                        context.stroke(convertedFrame)
                        #endif
                    }
                } else {
                    removeSanitizedElement(element)
                }
            }
        } else {
            context.setFillColor(UIColor.blue.cgColor)
            for element in sanitizedElements {
                if let frame = element.frameInWindow {
                    context.fill(frame)
                }
            }
        }

        // Get the resulting image
        if let image = UIGraphicsGetImageFromCurrentImageContext() {
            if let compressedData = image.jpegData(compressionQuality: self.settings.imgCompression) {
                screenshots.append(compressedData)
                if screenshots.count >= 10 {
                    self.sendScreenshots()
                }
            }
        }
        UIGraphicsEndImageContext()
    }

    // MARK: - sending screenshots
    func sendScreenshots() {
        let sessionId =  Globals.getSessionId()
        if(sessionId.isEmpty) {
            return
        }
        let archiveName = "\(sessionId)-\(String(format: "%06d", self.lastIndex)).tar.gz"
        var combinedData = Data()
        let images = screenshots
        for (_, imageData) in screenshots.enumerated() {
            combinedData.append(imageData)
        }
    
        messagesQueue.addOperation {
            var entries: [TarEntry] = []
            for imageData in images {
                let filename = "\(String(format: "%06d", self.lastIndex)).jpeg"
                var tarEntry = TarContainer.Entry(info: .init(name: filename, type: .regular), data: imageData)
                tarEntry.info.permissions = Permissions(rawValue: 420)
                tarEntry.info.creationTime = Date()
                tarEntry.info.modificationTime = Date()
                
                entries.append(tarEntry)
                self.lastIndex+=1
            }
            do {
                let gzData = try GzipArchive.archive(data: TarContainer.create(from: entries))
                MessageCollector(target: self.target!, token: self.token!).sendImagesBatch(batch: gzData, fileName: archiveName)
            } catch {
                DebugUtils.log("Error writing tar.gz data: \(error)")
            }
        }
        screenshots.removeAll()
    }
}

// MARK: making extensions for UI
struct SensitiveViewWrapperRepresentable: UIViewRepresentable {
    @Binding var viewWrapper: SensitiveViewWrapper?

    func makeUIView(context: Context) -> SensitiveViewWrapper {
        let wrapper = SensitiveViewWrapper()
        viewWrapper = wrapper
        return wrapper
    }

    func updateUIView(_ uiView: SensitiveViewWrapper, context: Context) { }
}

struct SensitiveModifier: ViewModifier {
    @State private var viewWrapper: SensitiveViewWrapper?

    func body(content: Content) -> some View {
        content
            .background(SensitiveViewWrapperRepresentable(viewWrapper: $viewWrapper))
    }
}

public extension View {
    func sensitive() -> some View {
        self.modifier(SensitiveModifier())
    }
}

class SensitiveViewWrapper: UIView {
    override func didMoveToSuperview() {
        super.didMoveToSuperview()
        if self.superview != nil {
            ScreenshotManager.shared.addSanitizedElement(self)
        } else {
            ScreenshotManager.shared.removeSanitizedElement(self)
        }
    }
}

class SensitiveTextField: UITextField {
    override func didMoveToWindow() {
        super.didMoveToWindow()
        if self.window != nil {
            ScreenshotManager.shared.addSanitizedElement(self)
        } else {
            ScreenshotManager.shared.removeSanitizedElement(self)
        }
    }
}

// Protocol to make a UIView sanitizable
public protocol Sanitizable {
    var frameInWindow: CGRect? { get }
}

func getCaptureSettings(for quality: RecordingQuality) -> (captureRate: Double, imgCompression: Double) {
    switch quality {
    case .Low:
        return (captureRate: 1, imgCompression: 0.4)
    case .Standard:
        return (captureRate: 0.33, imgCompression: 0.5)
    case .High:
        return (captureRate: 0.20, imgCompression: 0.55)
    }
}

func getCaptureSettings(fps: Int, quality: String) -> (captureRate: Double, imgCompression: Double) {
    let limitedFPS = min(max(fps, 1), 99)
    let captureRate = 1.0 / Double(limitedFPS)
    
    var imgCompression: Double
    switch quality.lowercased() {
    case "low":
        imgCompression = 0.4
    case "standard":
        imgCompression = 0.5
    case "high":
        imgCompression = 0.6
    default:
        imgCompression = 0.5  // default to standard if quality string is not recognized
    }
    
    return (captureRate: captureRate, imgCompression: imgCompression)
}
#endif
