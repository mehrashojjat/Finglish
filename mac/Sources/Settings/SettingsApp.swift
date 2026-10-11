// "Finglish Settings": a small window, no Dock icon, no menu-bar item. Opens when you open it; quits when you close it.
// Changes are written to ~/Library/Application Support/Finglish Keyboard/settings.json and the running keyboard is told at once.
import SwiftUI
import AppKit

@main
enum Entry {
    static func main() {
        // Headless modes used by install.sh / uninstall.sh (no window, no Dock icon, exit immediately)
        let args = CommandLine.arguments
        if args.contains("--install") { print(Setup.run(force: true).en); exit(Registrar.status() == .enabled ? 0 : 1) }   // what the first launch does, without a window
        if args.contains("--register") { print(Registrar.register().en); exit(Registrar.status() == .enabled ? 0 : 1) }
        if args.contains("--unregister") { print(Registrar.disable().en); exit(0) }
        if args.contains("--status") { print(Registrar.status().rawValue); exit(0) }
        FinglishSettingsApp.main()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ n: Notification) { NSApp.setActivationPolicy(.accessory); NSApp.activate(ignoringOtherApps: true) }
    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { NSApp.activate(ignoringOtherApps: true); return true }
}

struct FinglishSettingsApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    var body: some Scene {
        Window("صفحه‌کلید فینگلیش", id: "main") { SettingsView() }
            .windowResizability(.contentSize)
    }
}
