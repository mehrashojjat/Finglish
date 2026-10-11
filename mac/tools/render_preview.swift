// Renders the candidate window and the settings form to PNG files WITHOUT showing any window (layout check).
//   mac/tools/render_preview.swift is compiled by mac/test.sh --preview
import AppKit
import SwiftUI

let out = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "preview", isDirectory: true)
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
NSApplication.shared.appearance = NSAppearance(named: .aqua)          // always light, so the images look the same at any time of day

func save(_ rep: NSBitmapImageRep?, _ name: String) {
    guard let rep = rep, let d = rep.representation(using: .png, properties: [:]) else { print("could not render \(name)"); return }
    try? d.write(to: out.appendingPathComponent(name)); print("wrote \(name) (\(rep.pixelsWide)×\(rep.pixelsHigh))")
}

// candidate window: Persian rows + pinned English row, then an e-mail ("as typed")
let panel = CandidatePanel.shared
save(panel.snapshot(CandidateModel(raw: "salam", rows: ["سلام", "سالم", "سلم", "سالام", "شالم", "ثلم"], selectedRow: 0, latin: "salam",
                                   latinSelected: false, page: 0, pages: 3, firstIndex: 0, latinIndex: 18, label: ""), persianDigits: true), "candidates.png")
save(panel.snapshot(CandidateModel(raw: "Hello", rows: ["هلو", "حلو"], selectedRow: nil, latin: "Hello",
                                   latinSelected: true, page: 0, pages: 1, firstIndex: 0, latinIndex: 2, label: ""), persianDigits: true), "candidates_latin_selected.png")
save(panel.snapshot(CandidateModel(raw: "me@example.com", rows: [], selectedRow: nil, latin: "me@example.com",
                                   latinSelected: true, page: 0, pages: 1, firstIndex: 0, latinIndex: 0, label: "as typed"), persianDigits: true), "candidates_email.png")

// the first-run guide (three slides) and the settings form
func snap<V: View>(_ view: V, _ name: String) {
    let host = NSHostingView(rootView: view.background(Color(nsColor: .windowBackgroundColor)))     // solid background: transparent areas would hide light text
    let fit = host.fittingSize                                             // a view with a fixed frame is drawn at exactly that size
    host.frame = NSRect(origin: .zero, size: fit.width > 100 && fit.height > 100 ? fit : NSSize(width: 560, height: 660))
    host.layoutSubtreeIfNeeded()
    RunLoop.current.run(until: Date().addingTimeInterval(1.0))
    host.layoutSubtreeIfNeeded()
    save(host.bitmapImageRepForCachingDisplay(in: host.bounds).map { r in host.cacheDisplay(in: host.bounds, to: r); return r }, name)
}
for page in 0..<GuideText.steps.count { snap(GuideView(startPage: page, onDone: {}, openKeyboardSettings: {}), "guide_\(page + 1).png") }
snap(BlockedView(text: Setup.fromDiskImageFa), "blocked.png")
snap(SettingsView(guide: false), "settings.png")

// the same form scrolled to the bottom (the About section)
func scrollViews(_ v: NSView) -> [NSScrollView] { (v as? NSScrollView).map { [$0] } ?? [] + v.subviews.flatMap(scrollViews) }
do {
    let host = NSHostingView(rootView: SettingsView(guide: false).background(Color(nsColor: .windowBackgroundColor)))
    host.frame = NSRect(x: 0, y: 0, width: 560, height: 660)
    let win = NSWindow(contentRect: host.frame, styleMask: [.titled], backing: .buffered, defer: false)   // never shown
    win.contentView = host
    host.layoutSubtreeIfNeeded(); RunLoop.current.run(until: Date().addingTimeInterval(1.0))
    if let sv = scrollViews(host).first, let doc = sv.documentView {
        doc.scroll(NSPoint(x: 0, y: max(0, doc.frame.height - sv.contentView.bounds.height)))
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))
    }
    save(host.bitmapImageRepForCachingDisplay(in: host.bounds).map { r in host.cacheDisplay(in: host.bounds, to: r); return r }, "settings_bottom.png")
}
