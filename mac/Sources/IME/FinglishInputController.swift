// The InputMethodKit adapter: macOS calls this for every key typed while the Finglish keyboard is selected.
// All the typing rules live in Session (tested without macOS); this class only translates events and draws.
import Cocoa
import InputMethodKit

@objc(FinglishInputController)
final class FinglishInputController: IMKInputController, SessionClient {
    fileprivate(set) var session: Session!
    private var textClient: IMKTextInput?
    private var lastCommitted = ""

    override init!(server: IMKServer!, delegate: Any!, client inputClient: Any!) {
        super.init(server: server, delegate: delegate, client: inputClient)
        textClient = inputClient as? IMKTextInput
        session = Session(settings: AppState.shared.settings, engine: EngineHost.shared)
        session.client = self
        NotificationCenter.default.addObserver(self, selector: #selector(engineIsReady), name: .engineReady, object: nil)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    @objc private func engineIsReady() { session.engineBecameReady() }

    // MARK: IMKInputController
    override func recognizedEvents(_ sender: Any!) -> Int { Int(truncatingIfNeeded: NSEvent.EventTypeMask.keyDown.rawValue) }

    override func activateServer(_ sender: Any!) {
        Debug.log("activateServer")
        MenuActions.shared.controller = self
        if let c = sender as? IMKTextInput { textClient = c }
        textClient?.overrideKeyboard(withKeyboardNamed: "com.apple.keylayout.ABC")     // Latin letters whatever layout was active before
        session.settings = AppState.shared.settings
        EngineHost.shared.clientActivated()
    }

    override func deactivateServer(_ sender: Any!) {
        Debug.log("deactivateServer (composing=\(session.isComposing))")
        session.finish()
        CandidatePanel.shared.hide()
        EngineHost.shared.clientDeactivated(unloadAfterMinutes: AppState.shared.settings.unloadAfterMinutes)
    }

    override func commitComposition(_ sender: Any!) {
        Debug.log("commitComposition called by the system/app (composing=\(session.isComposing))")
        session.finish()
    }

    override func handle(_ event: NSEvent!, client sender: Any!) -> Bool {
        guard let event = event, event.type == .keyDown else { return false }
        if let c = sender as? IMKTextInput { textClient = c }
        MenuActions.shared.controller = self
        session.settings = AppState.shared.settings
        defer { Debug.log("   -> composing=\(session.isComposing)") }
        Debug.log("key code=\(event.keyCode) chars=\(event.characters.map { "\"\($0)\"" } ?? "nil") mods=\(event.modifierFlags.intersection([.command, .control, .option, .shift]).rawValue) composing=\(session.isComposing) onlySpaceCommits=\(AppState.shared.settings.onlySpaceCommits) signs=\(AppState.shared.settings.wordSigns.count)")
        let mods = event.modifierFlags.intersection([.command, .control, .option, .shift])

        if mods.contains(.command) || mods.contains(.control) || mods.contains(.option) {   // shortcuts belong to the app
            session.finish(); return false
        }
        guard let key = KeyTranslator.key(for: event) else { session.finish(); return false }
        let consumed = session.handle(key)
        Debug.log("   key \(key) consumed=\(consumed)")
        return consumed
    }

    // MARK: input-menu (the keyboard menu in the menu bar): the main switches are one click away, no settings window needed
    //
    // This menu is DRAWN BY macOS, in another process. It cannot call back an arbitrary object of ours: the only thing it can do is send the
    // action's NAME to this input controller. So the items have NO target, and every action is an @objc method of this class (an earlier
    // version aimed them at a helper object, and clicking a switch did nothing).
    struct SettingToggle { let title: String; let path: WritableKeyPath<Settings, Bool>; let action: Selector }
    static let toggles: [SettingToggle] = [
        SettingToggle(title: "فقط فاصله کلمه را تایید کند (علامت‌ها می‌چسبند)", path: \.onlySpaceCommits, action: #selector(FinglishInputController.toggleOnlySpace(_:))),
        SettingToggle(title: "نوشتن متن به انگلیسی (کلید صفر)", path: \.showLatin, action: #selector(FinglishInputController.toggleEnglishRow(_:))),
        SettingToggle(title: "نمایش کلمه داخل متن", path: \.inlinePreview, action: #selector(FinglishInputController.togglePreview(_:))),
        SettingToggle(title: "بعد از انتخاب با عدد، فاصله هم بیفتد", path: \.autoSpace, action: #selector(FinglishInputController.toggleAutoSpace(_:))),
        SettingToggle(title: "ارقام فارسی (۱ ۲ ۳)", path: \.persianDigits, action: #selector(FinglishInputController.toggleDigits(_:))),
        SettingToggle(title: "نقطه‌گذاری فارسی (، ؛ ؟)", path: \.mapPunct, action: #selector(FinglishInputController.togglePunctuation(_:))),
        SettingToggle(title: "در نظر گرفتن کلمهٔ قبلی", path: \.context, action: #selector(FinglishInputController.toggleContext(_:))),
        SettingToggle(title: "یادگیری از انتخاب‌های من", path: \.learn, action: #selector(FinglishInputController.toggleLearning(_:))),
    ]

    override func menu() -> NSMenu! {
        let m = NSMenu(title: "Finglish")
        let st = AppState.shared.settings
        for t in Self.toggles {
            let item = NSMenuItem(title: t.title, action: t.action, keyEquivalent: "")
            item.state = st[keyPath: t.path] ? .on : .off              // read fresh every time the menu opens
            m.addItem(item)
        }
        m.addItem(.separator())
        // The documented way for an input method to offer its settings: an item whose action is showPreferences: (InputMethodKit).
        m.addItem(NSMenuItem(title: "تنظیمات فینگلیش", action: #selector(showPreferences(_:)), keyEquivalent: ""))
        return m
    }

    @objc func toggleOnlySpace(_ sender: Any?) { flip(\.onlySpaceCommits) }
    @objc func toggleEnglishRow(_ sender: Any?) { flip(\.showLatin) }
    @objc func togglePreview(_ sender: Any?) { flip(\.inlinePreview) }
    @objc func toggleAutoSpace(_ sender: Any?) { flip(\.autoSpace) }
    @objc func toggleDigits(_ sender: Any?) { flip(\.persianDigits) }
    @objc func togglePunctuation(_ sender: Any?) { flip(\.mapPunct) }
    @objc func toggleContext(_ sender: Any?) { flip(\.context) }
    @objc func toggleLearning(_ sender: Any?) { flip(\.learn) }

    private func flip(_ path: WritableKeyPath<Settings, Bool>) {
        Debug.log("menu: toggled \(path)")
        session.finish()
        var s = AppState.shared.settings
        s[keyPath: path].toggle()
        AppState.shared.update(s)                                      // saved, and the settings window is told at once
    }

    /// The settings entry of this input method: the menu item above, and the system's own "Preferences" request.
    override func showPreferences(_ sender: Any!) { MenuActions.shared.openSettings(nil) }

    // MARK: SessionClient
    func setMarked(_ text: String) {
        Debug.log("   setMarked \"\(text)\"")
        guard let c = textClient else { return }
        let attributed = NSAttributedString(string: text, attributes: [.underlineStyle: NSUnderlineStyle.single.rawValue])
        c.setMarkedText(attributed, selectionRange: NSRange(location: text.utf16.count, length: 0),
                        replacementRange: NSRange(location: NSNotFound, length: NSNotFound))
    }

    func commit(_ text: String) {
        Debug.log("   COMMIT \"\(text)\"")
        textClient?.insertText(text, replacementRange: NSRange(location: NSNotFound, length: NSNotFound))
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty { lastCommitted = trimmed }
    }

    /// The text before the word being typed (previous-word context). Falls back to the last word this keyboard committed.
    func textBeforeCaret() -> String {
        guard let c = textClient else { return lastCommitted }
        let marked = c.markedRange()
        let sel = c.selectedRange()
        let end = marked.location != NSNotFound ? marked.location : sel.location
        guard end != NSNotFound, end > 0 else { return lastCommitted }
        let start = max(0, end - 40)
        return c.attributedSubstring(from: NSRange(location: start, length: end - start))?.string ?? lastCommitted
    }

    func show(_ model: CandidateModel?) {
        guard let model = model else { CandidatePanel.shared.hide(); return }
        var rect = NSRect.zero
        _ = textClient?.attributes(forCharacterIndex: 0, lineHeightRectangle: &rect)
        CandidatePanel.shared.onPick = { [weak self] i in self?.session.pick(i) }
        CandidatePanel.shared.show(model, anchor: rect, persianDigits: AppState.shared.settings.persianDigits)
    }
}


/// Opens the settings app (the target of the "تنظیمات فینگلیش" item, through showPreferences).
final class MenuActions: NSObject {
    static let shared = MenuActions()
    weak var controller: FinglishInputController?

    @objc func openSettings(_ sender: Any?) {
        let ws = NSWorkspace.shared
        let url = ws.urlForApplication(withBundleIdentifier: "com.finglish.FinglishSettings")
            ?? [URL(fileURLWithPath: "/Applications/Finglish Settings.app"), FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications/Finglish Settings.app")].first { FileManager.default.fileExists(atPath: $0.path) }
            ?? URL(fileURLWithPath: "/Applications/Finglish Settings.app")
        ws.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
    }
}
