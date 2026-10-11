// The first-run guide (a sheet over the settings window): three slides, each a screenshot of the real System Settings with the thing to click outlined in red, and the
// step written under it. macOS does not let an app add a new keyboard for the user (see InputSourceRegistrar.swift), so this is the
// one thing the user does themselves — once. The same three steps are shown, in text, in the Keyboard section of the settings until
// the keyboard has been added (the slides carry no remark about the window updating itself; the settings only say that the warning
// sign turns into a green tick).
import SwiftUI
import AppKit

enum GuideText {
    /// Persian text that mixes in Latin names must be laid out right-to-left as a whole, even when it STARTS with a Latin word (macOS…):
    /// a leading right-to-left mark makes the paragraph right-to-left, so the Latin words stay where they belong in the sentence.
    static func fa(_ s: String) -> String { "\u{200F}" + s }
    /// A Latin (or mixed) name that must read exactly as macOS shows it, e.g. "Finglish (فینگلیش)".
    static func name(_ s: String) -> String { "\u{2066}" + s + "\u{2069}" }

    static let heading = "افزودن صفحه‌کلید فینگلیش"

    // the names exactly as macOS shows them (left-to-right inside the Persian sentence)
    private static let textInput = name("Text Input"), edit = name("Edit"), inputSources = name("Input Sources"), plus = name("+")
    private static let persian = name("Persian"), finglish = name("Finglish (فینگلیش)"), add = name("Add"), done = name("Done")

    struct Step { let image: String; let text: String }
    static let steps: [Step] = [
        Step(image: "step1-edit", text: "۱. در تنظیمات صفحه‌کلید، زیر \(textInput)، روی \(edit) کنار \(inputSources) بزنید."),
        Step(image: "step2-plus", text: "۲. روی \(plus) پایین سمت چپ پنجره بزنید."),
        Step(image: "step3-add", text: "۳. از ستون سمت چپ \(persian) را انتخاب کنید، بعد از ستون سمت راست \(finglish) را انتخاب کنید و روی \(add) بزنید."),
        Step(image: "step4-done", text: "۴. در صفحهٔ بعد، روی \(done) بزنید تا کار تمام شود."),
    ]
    /// Not a step: why the user has to do it. (Shown in the slides and in the settings.)
    static let note = "macOS اجازه نمی‌دهد برنامه‌ها صفحه‌کلید تازه را به‌جای شما اضافه کنند؛ انجام این کار فقط یک بار لازم است."
    /// Settings only, never in the slides: what the warning sign above means.
    static let statusHint = "بعد از اضافه شدن، علامت هشدار بالا به تیک سبز تبدیل می‌شود؛ یعنی صفحه‌کلید شناسایی شد."

    /// The screenshots live in the app (Contents/Resources/Guide); FINGLISH_GUIDE_DIR points the tests and the preview at the source folder.
    static func image(_ name: String) -> NSImage? {
        if let dir = ProcessInfo.processInfo.environment["FINGLISH_GUIDE_DIR"] { return NSImage(contentsOfFile: dir + "/" + name + ".png") }
        return Bundle.main.url(forResource: name, withExtension: "png", subdirectory: "Guide").flatMap { NSImage(contentsOf: $0) }
    }
}

struct GuideView: View {
    var onDone: () -> Void
    var openKeyboardSettings: () -> Void
    @State private var page: Int
    init(startPage: Int = 0, onDone: @escaping () -> Void, openKeyboardSettings: @escaping () -> Void) {
        _page = State(initialValue: startPage); self.onDone = onDone; self.openKeyboardSettings = openKeyboardSettings
    }

    private func digits(_ n: Int) -> String { n.formatted(.number.locale(Locale(identifier: "fa_IR"))) }

    var body: some View {
        let step = GuideText.steps[page]
        let last = page == GuideText.steps.count - 1
        VStack(spacing: 12) {
            VStack(spacing: 2) {
                Text(GuideText.heading).font(.title3.bold())
                Text("مرحلهٔ \(digits(page + 1)) از \(digits(GuideText.steps.count))").font(.caption).foregroundStyle(.secondary)
            }
            if let img = GuideText.image(step.image) {
                Image(nsImage: img).resizable().scaledToFit().frame(maxWidth: 420)
            } else {
                RoundedRectangle(cornerRadius: 10).fill(.quaternary).frame(width: 420, height: 356)
            }
            Text(GuideText.fa(step.text)).font(.body).multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
            Text(GuideText.fa(GuideText.note)).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
            Spacer(minLength: 0)
            HStack {
                Button("قبلی") { page -= 1 }.disabled(page == 0)
                Spacer()
                Button("باز کردن تنظیمات صفحه‌کلید") { openKeyboardSettings() }
                Spacer()
                if last { Button("تمام") { onDone() }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction) }
                else { Button("بعدی") { page += 1 }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction) }
            }
        }
        .padding(18)
        .frame(width: 520, height: 610)
        .environment(\.layoutDirection, .rightToLeft)
    }
}

/// Shown instead of everything else when the app is run from inside the disk image (nothing may be installed from there).
struct BlockedView: View {
    let text: String
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "arrow.down.app").font(.system(size: 44)).foregroundStyle(.secondary)
            Text(GuideText.fa(text)).font(.title3).multilineTextAlignment(.center)
        }
        .padding(30).frame(maxWidth: .infinity, maxHeight: .infinity)
        .environment(\.layoutDirection, .rightToLeft)
    }
}
