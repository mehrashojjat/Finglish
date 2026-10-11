// Entry point of the input method process. macOS starts this app when the Finglish keyboard is first selected;
// until then (and while nothing is typed) it does nothing: no timers, no polling, no network, engine not loaded.
import Cocoa
import InputMethodKit

let connectionName = (Bundle.main.object(forInfoDictionaryKey: "InputMethodConnectionName") as? String) ?? "Finglish_1_Connection"
let server = IMKServer(name: connectionName, bundleIdentifier: Bundle.main.bundleIdentifier)
AppState.shared.start()
_ = server
NSApplication.shared.run()
