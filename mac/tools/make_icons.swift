// Draws the app icon (same as the website's logo: a white Vazirmatn ف on a blue rounded square) and the menu-bar icon.
//   swift mac/tools/make_icons.swift <output dir>      →  AppIcon.iconset/, menu-icon.tiff
import AppKit

let out = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icons", isDirectory: true)
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

func render(pixels: Int, _ draw: (CGFloat) -> Void) -> NSBitmapImageRep {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4,
                               hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSColor.clear.setFill(); NSRect(x: 0, y: 0, width: pixels, height: pixels).fill()
    draw(CGFloat(pixels))
    NSGraphicsContext.restoreGraphicsState()
    return rep
}

// The letter is the outline in assets/img/logo.svg (Vazirmatn Bold ف, made by tools/make_logo.swift) — the same file the website uses.
// Its coordinates are on a 64×64 logo square, y pointing down; the path only uses M / L / Q / C / Z with absolute numbers.
let logo = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .appendingPathComponent("assets/img/logo.svg")
let letter: CGPath = {
    let svg = try! String(contentsOf: logo, encoding: .utf8)
    guard svg.contains("viewBox=\"0 0 64 64\""), let r = svg.range(of: #" id="fe"[^>]* d=""#, options: .regularExpression),
          let end = svg[r.upperBound...].firstIndex(of: "\"") else { fatalError("unexpected \(logo.path)") }
    let tokens = svg[r.upperBound..<end].split(separator: " ").map(String.init)
    let path = CGMutablePath()
    var i = 0
    func n(_ k: Int) -> CGPoint { CGPoint(x: Double(tokens[i + 1 + 2 * k])!, y: Double(tokens[i + 2 + 2 * k])!) }
    while i < tokens.count {
        switch tokens[i] {
        case "M": path.move(to: n(0)); i += 3
        case "L": path.addLine(to: n(0)); i += 3
        case "Q": path.addQuadCurve(to: n(1), control: n(0)); i += 5
        case "C": path.addCurve(to: n(2), control1: n(0), control2: n(1)); i += 7
        case "Z": path.closeSubpath(); i += 1
        default: fatalError("path command \(tokens[i])")
        }
    }
    return path
}()

func appIcon(_ s: CGFloat) {
    let inner = s * 0.82                                   // macOS keeps a margin around the icon shape
    let r = NSRect(x: (s - inner) / 2, y: (s - inner) / 2, width: inner, height: inner)
    let shape = NSBezierPath(roundedRect: r, xRadius: inner * 0.25, yRadius: inner * 0.25)   // the website's logo: corner radius = 1/4
    NSColor(srgbRed: 0x2f / 255, green: 0x6f / 255, blue: 0xed / 255, alpha: 1).setFill()
    shape.fill()
    // 64-unit logo square → the inner square (flip y: the SVG points down, the bitmap points up)
    var t = CGAffineTransform(translationX: r.minX, y: r.maxY).scaledBy(x: inner / 64, y: -inner / 64)
    NSColor.white.setFill()
    NSBezierPath(cgPath: letter.copy(using: &t)!).fill()
}

// AppIcon.iconset (iconutil turns it into AppIcon.icns)
let iconset = out.appendingPathComponent("AppIcon.iconset", isDirectory: true)
try? FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
for (name, px) in [("16x16", 16), ("16x16@2x", 32), ("32x32", 32), ("32x32@2x", 64), ("128x128", 128), ("128x128@2x", 256),
                   ("256x256", 256), ("256x256@2x", 512), ("512x512", 512), ("512x512@2x", 1024)] {
    let rep = render(pixels: px) { appIcon($0) }
    try! rep.representation(using: .png, properties: [:])!.write(to: iconset.appendingPathComponent("icon_\(name).png"))
}

// Menu-bar icon: black ف on transparent, 16×16 pt @2x (the system tints "template" images for dark menu bars)
let menu = render(pixels: 32) { s in
    let box = letter.boundingBox                           // centre the letter by its ink and let it fill 84 % of the square
    let k = s * 0.84 / max(box.width, box.height)
    var t = CGAffineTransform(translationX: s / 2, y: s / 2).scaledBy(x: k, y: -k).translatedBy(x: -box.midX, y: -box.midY)
    NSColor.black.setFill()
    NSBezierPath(cgPath: letter.copy(using: &t)!).fill()
}
menu.size = NSSize(width: 16, height: 16)                  // 32 px at 16 pt = @2x
try! menu.tiffRepresentation!.write(to: out.appendingPathComponent("menu-icon.tiff"))
print("icons written to \(out.path)")
