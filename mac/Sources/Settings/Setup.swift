// What happens when the settings app is opened: make sure the keyboard it carries is installed and registered with macOS.
// The first launch IS the installation; every later launch is just a check. Adding the keyboard to the user's list is the user's own
// step (see InputSourceRegistrar.swift); the first-run guide shows how, and nothing here ever opens System Settings.
import AppKit

enum Setup {
    /// `quiet` = nothing to tell the user (the guide or the normal window already says it). `blocking` = the app must not be used from
    /// where it is (inside the disk image): the window shows only this.
    struct Report { let en: String; let fa: String; var quiet = false; var blocking = false }

    static let fromDiskImageEn = "Drag the app to the Applications folder first, then open it from there."
    static let fromDiskImageFa = "اول برنامه را به پوشهٔ Applications بکشید، بعد از همان‌جا بازش کنید."
    static var isRunningFromDiskImage: Bool { Bundle.main.bundlePath.hasPrefix("/Volumes/") }

    /// `force` = the user explicitly asked (install.sh / --install): try to add the keyboard to the list even if it was already installed.
    static func run(force: Bool) -> Report {
        if isRunningFromDiskImage { return Report(en: fromDiskImageEn, fa: fromDiskImageFa, blocking: true) }
        let result = KeyboardInstaller.installIfNeeded(stopRunning: stopKeyboard)
        if case .failed(let why) = result {
            return Report(en: "Could not install the keyboard: \(why)", fa: "نصب صفحه‌کلید انجام نشد: \(why)")
        }
        let fresh = result == .installed
        if Registrar.status() == .enabled {
            // Already in the user's list: nothing to say in the window (an earlier message here read badly, and nobody needs it).
            return Report(en: fresh ? "Keyboard installed (it was already in your list)." : "The keyboard is installed and in your list.", fa: "", quiet: true)
        }
        if fresh || force {
            let o = Registrar.register()                             // only tells macOS about the keyboard; nothing is opened
            return Report(en: (fresh ? "Keyboard installed. " : "") + o.en, fa: o.fa, quiet: true)
        }
        return Report(en: "The keyboard is installed but not in your list.", fa: "", quiet: true)
    }

    /// The running keyboard must quit before its files are replaced; macOS starts the new one the next time it is needed.
    private static func stopKeyboard() {
        let running = NSRunningApplication.runningApplications(withBundleIdentifier: Registrar.bundleID)
        running.forEach { $0.terminate() }
        let end = Date().addingTimeInterval(2)
        while running.contains(where: { !$0.isTerminated }) && Date() < end { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
        running.filter { !$0.isTerminated }.forEach { $0.forceTerminate() }
    }
}
