import Foundation
import CoreGraphics
import CoreText
import ImageIO

struct MockDocumentFiles {
    static func make(title: String, project: Project, image: Bool) throws -> URL {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("VenioDocuments/" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appendingPathComponent(image ? "chantier.png" : "document.pdf")
        if image {
            guard let context = CGContext(data: nil, width: 480, height: 320, bitsPerComponent: 8, bytesPerRow: 0,
                                          space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
                throw VenioAPIError(code: "FILE_UNAVAILABLE")
            }
            context.setFillColor(gray: 0.92, alpha: 1)
            context.fill(CGRect(x: 0, y: 0, width: 480, height: 320))
            context.setStrokeColor(gray: 0.25, alpha: 1)
            context.setLineWidth(8)
            context.stroke(CGRect(x: 60, y: 55, width: 360, height: 210))
            context.stroke(CGRect(x: 60, y: 55, width: 160, height: 110))
            context.stroke(CGRect(x: 270, y: 170, width: 150, height: 95))
            guard let cgImage = context.makeImage(), let destination = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else {
                throw VenioAPIError(code: "FILE_UNAVAILABLE")
            }
            CGImageDestinationAddImage(destination, cgImage, nil)
            guard CGImageDestinationFinalize(destination) else { throw VenioAPIError(code: "FILE_UNAVAILABLE") }
        } else {
            var box = CGRect(x: 0, y: 0, width: 595, height: 842)
            guard let consumer = CGDataConsumer(url: url as CFURL), let context = CGContext(consumer: consumer, mediaBox: &box, nil) else {
                throw VenioAPIError(code: "FILE_UNAVAILABLE")
            }
            context.beginPDFPage(nil)
            for (index, line) in [title, project.clientName, project.projectNumber, project.name].enumerated() {
                let attributes: [NSAttributedString.Key: Any] = [
                    NSAttributedString.Key(kCTFontAttributeName as String): CTFontCreateWithName("Helvetica" as CFString, index == 0 ? 24 : 16, nil)
                ]
                context.textPosition = CGPoint(x: 48, y: 760 - index * 46)
                CTLineDraw(CTLineCreateWithAttributedString(NSAttributedString(string: line, attributes: attributes)), context)
            }
            context.endPDFPage()
            context.closePDF()
        }
        return url
    }
}
