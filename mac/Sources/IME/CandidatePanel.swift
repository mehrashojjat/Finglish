// The drop-down list of words under the typing position: Persian candidates numbered ۱… (press the number to pick),
// the typed Latin pinned at the bottom as ۰ (press 0 to keep the English as typed). Clicking a row picks it too.
// A borderless, non-activating panel: it never takes keyboard focus from the app you are typing in.
import Cocoa

private final class FloatingPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

private final class RowView: NSView {
    var onClick: (() -> Void)?
    var selected = false { didSet { layer?.backgroundColor = selected ? NSColor.controlAccentColor.withAlphaComponent(0.28).cgColor : NSColor.clear.cgColor } }
    override init(frame: NSRect) { super.init(frame: frame); wantsLayer = true; layer?.cornerRadius = 6 }
    required init?(coder: NSCoder) { fatalError() }
    override func mouseDown(with event: NSEvent) { onClick?() }
    override var acceptsFirstResponder: Bool { false }
}

final class CandidatePanel {
    static let shared = CandidatePanel()
    var onPick: ((Int) -> Void)?

    private let panel: FloatingPanel
    private let effect = NSVisualEffectView()
    private let stack = NSStackView()

    private init() {
        panel = FloatingPanel(contentRect: NSRect(x: 0, y: 0, width: 200, height: 80),
                              styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: true)
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.popUpMenu.rawValue + 1)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        effect.material = .menu
        effect.blendingMode = .behindWindow
        effect.state = .active
        effect.wantsLayer = true
        effect.layer?.cornerRadius = 10
        effect.layer?.masksToBounds = true
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 1
        stack.edgeInsets = NSEdgeInsets(top: 6, left: 6, bottom: 6, right: 6)
        stack.translatesAutoresizingMaskIntoConstraints = false
        effect.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: effect.leadingAnchor), stack.trailingAnchor.constraint(equalTo: effect.trailingAnchor),
            stack.topAnchor.constraint(equalTo: effect.topAnchor), stack.bottomAnchor.constraint(equalTo: effect.bottomAnchor),
        ])
        panel.contentView = effect
    }

    func hide() { panel.orderOut(nil) }

    /// Render the window's content to an image WITHOUT showing it (used by mac/tools/render_preview.swift to check the layout).
    func snapshot(_ m: CandidateModel, persianDigits: Bool) -> NSBitmapImageRep? {
        rebuild(m, persianDigits: persianDigits)
        stack.layoutSubtreeIfNeeded()
        var size = stack.fittingSize
        size.width = max(size.width, 190)
        effect.frame = NSRect(origin: .zero, size: size)
        effect.layoutSubtreeIfNeeded()
        guard let rep = effect.bitmapImageRepForCachingDisplay(in: effect.bounds) else { return nil }
        effect.cacheDisplay(in: effect.bounds, to: rep)
        return rep
    }

    func show(_ m: CandidateModel, anchor: NSRect, persianDigits: Bool) {
        rebuild(m, persianDigits: persianDigits)
        stack.layoutSubtreeIfNeeded()
        var size = stack.fittingSize
        size.width = max(size.width, 190)
        panel.setContentSize(size)
        panel.setFrameOrigin(origin(for: size, anchor: anchor))
        panel.orderFrontRegardless()
    }

    // MARK: layout
    private func rebuild(_ m: CandidateModel, persianDigits: Bool) {
        for v in stack.arrangedSubviews { stack.removeArrangedSubview(v); v.removeFromSuperview() }
        let width: CGFloat = 200

        // header: what you typed, and a small state label
        let head = NSStackView()
        head.orientation = .horizontal
        head.distribution = .fill
        let raw = label(m.raw, font: .monospacedSystemFont(ofSize: 13, weight: .semibold), color: .controlAccentColor)
        let state = label(m.label, font: .systemFont(ofSize: 10, weight: .medium), color: .secondaryLabelColor)
        head.addArrangedSubview(raw); head.addArrangedSubview(NSView()); head.addArrangedSubview(state)
        head.edgeInsets = NSEdgeInsets(top: 2, left: 6, bottom: 4, right: 6)
        stack.addArrangedSubview(head)
        head.widthAnchor.constraint(greaterThanOrEqualToConstant: width - 12).isActive = true

        // Persian candidates, numbered from 1 on every page
        for (k, text) in m.rows.enumerated() {
            let row = rowView(number: digit(k + 1, persianDigits), text: text, latin: false, selected: m.selectedRow == k)
            let index = m.firstIndex + k
            row.onClick = { [weak self] in self?.onPick?(index) }
            stack.addArrangedSubview(row)
            row.widthAnchor.constraint(greaterThanOrEqualToConstant: width - 12).isActive = true
        }

        // pinned: the typed Latin, key 0
        if let latin = m.latin {
            let sep = NSBox(); sep.boxType = .separator
            stack.addArrangedSubview(sep)
            sep.widthAnchor.constraint(greaterThanOrEqualToConstant: width - 12).isActive = true
            let row = rowView(number: digit(0, persianDigits), text: latin, latin: true, selected: m.latinSelected)
            let latinIndex = m.latinIndex
            row.onClick = { [weak self] in self?.onPick?(latinIndex) }
            stack.addArrangedSubview(row)
            row.widthAnchor.constraint(greaterThanOrEqualToConstant: width - 12).isActive = true
        }

        if m.pages > 1 {
            let pager = label("‹  \(m.page + 1) / \(m.pages)  ›   PgUp PgDn", font: .systemFont(ofSize: 10), color: .tertiaryLabelColor)
            pager.alignment = .center
            stack.addArrangedSubview(pager)
        }
    }

    private func rowView(number: String, text: String, latin: Bool, selected: Bool) -> RowView {
        let row = RowView(frame: .zero)
        row.selected = selected
        let n = label(number, font: .systemFont(ofSize: 12, weight: .medium), color: .secondaryLabelColor)
        n.alignment = .center
        n.widthAnchor.constraint(equalToConstant: 22).isActive = true
        let t: NSTextField
        if latin {
            t = label(text, font: .monospacedSystemFont(ofSize: 14, weight: .regular), color: selected ? .labelColor : .secondaryLabelColor)
            t.baseWritingDirection = .leftToRight
            t.alignment = .left
        } else {
            t = label(text, font: .systemFont(ofSize: 20), color: .labelColor)
            t.baseWritingDirection = .rightToLeft
            t.alignment = .right
        }
        t.lineBreakMode = .byTruncatingTail
        // Persian rows read right-to-left (number on the right); the Latin row left-to-right
        let h = NSStackView(views: latin ? [n, t] : [n, t])
        h.orientation = .horizontal
        h.spacing = 8
        h.userInterfaceLayoutDirection = latin ? .leftToRight : .rightToLeft
        h.edgeInsets = NSEdgeInsets(top: 2, left: 8, bottom: 2, right: 8)
        h.translatesAutoresizingMaskIntoConstraints = false
        row.addSubview(h)
        NSLayoutConstraint.activate([
            h.leadingAnchor.constraint(equalTo: row.leadingAnchor), h.trailingAnchor.constraint(equalTo: row.trailingAnchor),
            h.topAnchor.constraint(equalTo: row.topAnchor), h.bottomAnchor.constraint(equalTo: row.bottomAnchor),
        ])
        t.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return row
    }

    private func label(_ s: String, font: NSFont, color: NSColor) -> NSTextField {
        let l = NSTextField(labelWithString: s)
        l.font = font; l.textColor = color; l.isSelectable = false
        return l
    }

    private func digit(_ d: Int, _ persian: Bool) -> String { (persian ? Array("۰۱۲۳۴۵۶۷۸۹").map(String.init)[d] : String(d)) + "." }

    // MARK: placement (screen coordinates: y grows upward)
    private func origin(for size: NSSize, anchor: NSRect) -> NSPoint {
        let a = (anchor == .zero) ? NSRect(origin: NSEvent.mouseLocation, size: NSSize(width: 0, height: 18)) : anchor
        let screen = NSScreen.screens.first { $0.frame.contains(a.origin) } ?? NSScreen.main ?? NSScreen.screens[0]
        let vf = screen.visibleFrame
        var x = a.maxX - size.width                      // Persian is right-to-left: line the window up under the word's right end
        if x < vf.minX { x = a.minX }
        x = min(max(x, vf.minX + 4), vf.maxX - size.width - 4)
        var y = a.minY - size.height - 3                 // below the line …
        if y < vf.minY + 4 { y = a.maxY + 3 }            // … or above it when there is no room
        return NSPoint(x: x, y: y)
    }
}
