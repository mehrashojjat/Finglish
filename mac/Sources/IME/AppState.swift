// Process-wide state of the input method: the current settings, kept in sync with the settings app.
import Foundation

final class AppState {
    static let shared = AppState()
    private(set) var settings = UserFiles.loadSettings()
    private var observer: NSObjectProtocol?

    /// Start listening for changes made in the settings app (a distributed notification: no polling, no file watching).
    func start() {
        settings = UserFiles.loadSettings()
        EngineHost.shared.zwnj = settings.zwnj
        observer = DistributedNotificationCenter.default().addObserver(forName: UserFiles.changedName, object: nil, queue: .main) { [weak self] _ in self?.reload() }
    }

    func reload() {
        settings = UserFiles.loadSettings()
        EngineHost.shared.applyUserSettings(zwnj: settings.zwnj)
    }

    /// Change a setting from inside the keyboard (the Persian on/off toggle); persists and tells the settings app.
    func update(_ s: Settings) {
        settings = s
        UserFiles.saveSettings(s)
    }
}
