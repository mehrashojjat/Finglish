// The Finglish keyboard and the user's list of input sources.
//
// TISRegisterInputSource tells macOS about a freshly installed keyboard, so it shows up in System Settings → Keyboard → Text Input →
// Edit → + → Persian. That is ALL this file asks of macOS. It deliberately never calls TISEnableInputSource: MEASURED on macOS 26/27
// (2026-10-11) that call (a) adds nothing — TISSelectInputSource still answers -50 afterwards — and (b) makes macOS open System Settings
// by itself, which users do not want (registering alone opens nothing). So the user adds the keyboard once in System Settings, and this
// file REPORTS whether that has happened (the window polls it, both ways).
// NOT yet tried: writing the entry into com.apple.inputsources / AppleEnabledThirdPartyInputSources ourselves (where macOS itself
// records it, see EnabledSources). An earlier experiment wrote to the wrong preference (HIToolbox) and so proved nothing.
//
// "In the list" is read from the preferences macOS writes when the user adds it (see EnabledSources), never from the flag TIS reports
// for the keyboard mode: that flag says "enabled" even for a keyboard that is not in the list.
import Foundation
import Carbon

enum Registrar {
    static let bundleID = "com.finglish.inputmethod.Finglish"
    static let modeID = bundleID + ".Persian"

    enum Status: String {
        case notInstalled = "The keyboard is not installed yet."
        case notRegistered = "Installed, but macOS has not picked it up yet."
        case available = "Installed. Not added to your keyboards yet."
        case enabled = "Added to your keyboards."

        /// What the settings window shows (the English raw values are for the terminal: `--status`, install.sh).
        var persian: String {
            switch self {
            case .notInstalled: return "صفحه‌کلید هنوز نصب نشده."
            case .notRegistered: return "نصب شده، اما macOS هنوز آن را نشناخته."
            case .available: return "نصب شده، اما هنوز به صفحه‌کلیدهای سیستم اضافه نشده."
            case .enabled: return "صفحه‌کلید اضافه شده و آماده است."
            }
        }
    }

    /// A result in both languages: `en` is printed by the headless modes, `fa` is shown in the window.
    struct Outcome { let en: String; let fa: String }

    static var imeURL: URL { KeyboardInstaller.destinationURL }

    private static func installedSource(_ id: String) -> TISInputSource? {
        let filter = [kTISPropertyInputSourceID as String: id] as CFDictionary
        guard let cf = TISCreateInputSourceList(filter, true)?.takeRetainedValue() else { return nil }
        return (cf as? [TISInputSource])?.first
    }

    private static func list(_ domain: String, _ key: String) -> [[String: Any]] {
        CFPreferencesAppSynchronize(domain as CFString)
        return CFPreferencesCopyAppValue(key as CFString, domain as CFString) as? [[String: Any]] ?? []
    }

    /// Is the keyboard in the user's list? Read from the preferences macOS writes when the user adds it (see EnabledSources).
    static func isInUserList() -> Bool {
        EnabledSources.isAdded(thirdParty: list("com.apple.inputsources", "AppleEnabledThirdPartyInputSources"),
                               system: list("com.apple.HIToolbox", "AppleEnabledInputSources"), bundle: bundleID, mode: modeID)
    }

    static func status() -> Status {
        guard FileManager.default.fileExists(atPath: imeURL.path) else { return .notInstalled }
        guard installedSource(modeID) != nil else { return .notRegistered }
        return isInUserList() ? .enabled : .available
    }

    /// macOS writes the change a moment after the call: keep the main run loop turning until the list shows `wanted` (or `seconds` pass).
    private static func wait(until wanted: Bool, seconds: Double) -> Bool {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end {
            if isInUserList() == wanted { return true }
            RunLoop.main.run(until: Date().addingTimeInterval(0.15))
        }
        return isInUserList() == wanted
    }

    private static let manualEn = "macOS does not let an app add a new keyboard for you, so add it yourself once: System Settings → Keyboard → Text Input → Edit → + → Persian → Finglish → Add, then Done."
    private static let manualFa = "macOS اجازه نمی‌دهد برنامه‌ها صفحه‌کلید تازه را به‌جای شما اضافه کنند؛ خودتان یک بار اضافه کنید: System Settings ← Keyboard ← Text Input ← Edit ← + ← Persian ← Finglish ← Add، بعد Done."

    /// Tell macOS about the installed keyboard. Never opens anything. Must run on the main thread (TIS requires it).
    @discardableResult static func register() -> Outcome {
        guard FileManager.default.fileExists(atPath: imeURL.path) else {
            return Outcome(en: "Finglish.app is not in ~/Library/Input Methods — open the Finglish Settings app once (or run mac/install.sh).",
                           fa: "صفحه‌کلید هنوز نصب نشده است — برنامهٔ Finglish Settings را یک بار باز کنید.")
        }
        if isInUserList() { return Outcome(en: "Already added to your keyboards.", fa: "از قبل به صفحه‌کلیدهای شما اضافه شده است.") }
        let r = TISRegisterInputSource(imeURL as CFURL)
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))   // let the registration settle
        guard installedSource(modeID) != nil else {
            return Outcome(en: "macOS did not list the keyboard after registering (status \(r)). Logging out and in once will make it appear.",
                           fa: "macOS بعد از ثبت، صفحه‌کلید را نشان نداد (کد \(r)). یک بار از حساب کاربری‌تان خارج شوید و دوباره وارد شوید.")
        }
        return Outcome(en: "Registered. " + manualEn, fa: manualFa)
    }

    @discardableResult static func disable() -> Outcome {
        var found = false
        for id in [modeID, bundleID] { if let s = installedSource(id) { found = true; _ = TISDisableInputSource(s) } }
        guard found else { return Outcome(en: "Not in your keyboard list.", fa: "در فهرست صفحه‌کلیدهای شما نیست.") }
        return wait(until: false, seconds: 3) ? Outcome(en: "Removed from your keyboards.", fa: "از صفحه‌کلیدهای شما حذف شد.")
                                              : Outcome(en: "Finglish is still in your keyboard list: remove it in System Settings → Keyboard → Text Input → Edit (the − button).",
                                                        fa: "فینگلیش هنوز در فهرست صفحه‌کلیدهاست: آن را در System Settings ← Keyboard ← Text Input ← Edit با دکمهٔ − حذف کنید.")
    }

    static func selectNow() { if let s = installedSource(modeID) { TISSelectInputSource(s) } }
}
