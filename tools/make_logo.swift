// Outlines the Vazirmatn Bold "ف" and writes it as the project's logo: a white ف on the blue rounded square.
//   swift tools/make_logo.swift [font.ttf] [out.svg]      (defaults: assets/fonts/Vazirmatn-Bold.ttf  →  assets/img/logo.svg)
// The result is the single source of the logo: the website (header + favicon) uses the SVG as it is, and mac/tools/make_icons.swift
// reads the same path for the app icon and the menu-bar icon. Font: Vazirmatn (SIL OFL 1.1, assets/fonts/OFL.txt).
import Foundation
import CoreText
import CoreGraphics

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let args = CommandLine.arguments
let fontURL = args.count > 1 ? URL(fileURLWithPath: args[1]) : root.appendingPathComponent("assets/fonts/Vazirmatn-Bold.ttf")
let outURL = args.count > 2 ? URL(fileURLWithPath: args[2]) : root.appendingPathComponent("assets/img/logo.svg")

guard let provider = CGDataProvider(url: fontURL as CFURL), let cg = CGFont(provider) else { fatalError("cannot read \(fontURL.path)") }
let font = CTFontCreateWithGraphicsFont(cg, 1000, nil, nil)

// Shape the lone letter the way a text engine does, so the isolated form of ف is the one we get.
let line = CTLineCreateWithAttributedString(NSAttributedString(string: "ف", attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font]))
let runs = CTLineGetGlyphRuns(line) as! [CTRun]
precondition(runs.count == 1 && CTRunGetGlyphCount(runs[0]) == 1, "expected exactly one glyph")
var glyph = CGGlyph(); CTRunGetGlyphs(runs[0], CFRangeMake(0, 1), &glyph)
guard let outline = CTFontCreatePathForGlyph(font, glyph, nil) else { fatalError("no outline") }

// Fit the letter into the 64×64 logo: its bounding box (dot included) is centred, and the longer side takes 54 % of the square.
let box = outline.boundingBoxOfPath
let k = 0.54 * 64 / max(box.width, box.height)
func pt(_ p: CGPoint) -> String {
    let x = 32 + (p.x - box.midX) * k, y = 32 - (p.y - box.midY) * k          // font space is y-up, SVG is y-down
    return String(format: "%.2f %.2f", x, y)
}
var d = [String]()
outline.applyWithBlock { e in
    let p = e.pointee.points
    switch e.pointee.type {
    case .moveToPoint: d.append("M \(pt(p[0]))")
    case .addLineToPoint: d.append("L \(pt(p[0]))")
    case .addQuadCurveToPoint: d.append("Q \(pt(p[0])) \(pt(p[1]))")
    case .addCurveToPoint: d.append("C \(pt(p[0])) \(pt(p[1])) \(pt(p[2]))")
    case .closeSubpath: d.append("Z")
    @unknown default: break
    }
}

let svg = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <!-- Finglish logo: Vazirmatn Bold ف, outlined by tools/make_logo.swift (font: SIL OFL 1.1). Do not edit by hand. -->
  <rect width="64" height="64" rx="16" fill="#2f6fed"/>
  <path id="fe" fill="#fff" fill-rule="nonzero" d="\(d.joined(separator: " "))"/>
</svg>

"""
try? FileManager.default.createDirectory(at: outURL.deletingLastPathComponent(), withIntermediateDirectories: true)
try svg.write(to: outURL, atomically: true, encoding: .utf8)
print("wrote \(outURL.path)  (\(d.count) path commands, glyph box \(Int(box.width))×\(Int(box.height)) font units)")
