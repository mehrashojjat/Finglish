// Optional diagnostics. Does NOTHING unless the empty file  ~/Library/Application Support/Finglish Keyboard/debug  exists
// (checked per key press, so it can be switched on/off without restarting). Writes ~/Library/Logs/Finglish/keyboard.log.
// Records key codes and the keyboard's decisions — and the characters typed — so delete the file (and the log) when done.
import Foundation

enum Debug {
    static var enabled: Bool { FileManager.default.fileExists(atPath: UserFiles.dir.appendingPathComponent("debug").path) }
    private static let queue = DispatchQueue(label: "com.finglish.debug")
    static func log(_ message: @autoclosure () -> String) {
        guard enabled else { return }
        let line = "\(ISO8601DateFormatter().string(from: Date())) \(message())\n"
        queue.async {
            let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Finglish", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appendingPathComponent("keyboard.log")
            if let h = try? FileHandle(forWritingTo: url) { h.seekToEndOfFile(); h.write(Data(line.utf8)); try? h.close() }
            else { try? line.write(to: url, atomically: true, encoding: .utf8) }
        }
    }
}
