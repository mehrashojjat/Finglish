// Puts the keyboard bundle in place. Plain file work, no macOS keyboard APIs, so it can be tested in a temporary folder.
//
// The settings app is the only thing a user installs (drag it to Applications). The keyboard travels inside it:
//     Finglish Settings.app/Contents/Resources/Keyboard/Finglish.bundle        (the signed keyboard, under a name that is not ".app"
//                                                                              so macOS does not list it as a second application)
// On first launch — and again whenever a newer copy of the app is dropped into Applications — it is copied to
//     ~/Library/Input Methods/Finglish.app                                      (the user's own folder: no password needed)
import Foundation

enum KeyboardInstaller {
    enum Result: Equatable {
        case notBundled            // this copy of the app carries no keyboard (a development build): nothing to install
        case upToDate              // the installed keyboard is the one inside this app
        case installed             // copied (first launch, or a different version was installed)
        case failed(String)
    }

    static var embeddedURL: URL { Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/Keyboard/Finglish.bundle") }
    static var destinationURL: URL { FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Input Methods/Finglish.app") }

    /// CFBundleVersion of a bundle (the build stamp: it changes with every build), or nil when there is no bundle there.
    static func version(of bundle: URL) -> String? {
        (NSDictionary(contentsOf: bundle.appendingPathComponent("Contents/Info.plist")))?["CFBundleVersion"] as? String
    }

    /// Copy `src` over `dst` unless `dst` already is that version. `stopRunning` is called just before an existing keyboard is replaced
    /// (the running copy must quit first; macOS starts the new one the next time the keyboard is used).
    static func installIfNeeded(from src: URL = embeddedURL, to dst: URL = destinationURL, stopRunning: () -> Void = {}) -> Result {
        let fm = FileManager.default
        guard let new = version(of: src) else { return .notBundled }
        if version(of: dst) == new, fm.isExecutableFile(atPath: dst.appendingPathComponent("Contents/MacOS/Finglish").path) { return .upToDate }
        stopRunning()
        do {
            try fm.createDirectory(at: dst.deletingLastPathComponent(), withIntermediateDirectories: true)
            if fm.fileExists(atPath: dst.path) { try fm.removeItem(at: dst) }
            try fm.copyItem(at: src, to: dst)
            return .installed
        } catch {
            return .failed(error.localizedDescription)
        }
    }
}

/// The first-run guide is for the FIRST time only: it is shown until the user has finished it ("تمام"/closed it) or the keyboard has been
/// seen in their list — and never again after that, even if they later remove the keyboard (then only the status in the settings changes).
enum Onboarding {
    static let key = "onboardingDone"
    static var done: Bool {
        get { UserDefaults.standard.bool(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
    static func shouldShowGuide(done: Bool, keyboardAdded: Bool) -> Bool { !done && !keyboardAdded }
}

/// Where macOS records the keyboards the user has added. MEASURED on macOS 26/27 (2026-10-11), by adding and then removing the keyboard in System Settings:
///   • a THIRD-PARTY keyboard (ours) goes to  com.apple.inputsources → AppleEnabledThirdPartyInputSources, as TWO entries:
///       the keyboard itself   { Bundle ID, InputSourceKind = "Keyboard Input Method" }
///       its mode              { Bundle ID, Input Mode = "<id>.Persian", InputSourceKind = "Input Mode" }
///   • REMOVING it deletes only the keyboard entry — the MODE entry stays behind as a leftover. So the keyboard entry is the one that
///     says "added"; the mode entry alone means nothing (and an earlier version that accepted it kept reporting a removed keyboard as added).
///   • Apple's own layouts stay in             com.apple.HIToolbox → AppleEnabledInputSources
/// (And the flag `kTISPropertyInputSourceIsEnabled` of the keyboard MODE must not be trusted either: macOS reports it as true even when
/// the keyboard is not in the list.)
enum EnabledSources {
    static func contains(_ entries: [[String: Any]], mode: String) -> Bool {
        entries.contains { ($0["Input Mode"] as? String) == mode }
    }
    /// The keyboard-level entry: our bundle, no "Input Mode" key, kind "Keyboard Input Method".
    static func hasKeyboardEntry(_ entries: [[String: Any]], bundle: String) -> Bool {
        entries.contains { ($0["Bundle ID"] as? String) == bundle && $0["Input Mode"] == nil && ($0["InputSourceKind"] as? String) == "Keyboard Input Method" }
    }
    /// Added = the keyboard entry is in the third-party list (where macOS 26/27 puts it) or our mode is in the system list (where another
    /// macOS version might put it).
    static func isAdded(thirdParty: [[String: Any]], system: [[String: Any]], bundle: String, mode: String) -> Bool {
        hasKeyboardEntry(thirdParty, bundle: bundle) || contains(system, mode: mode)
    }
}
