// Settings shared by the input method and the settings app: one JSON file + a "changed" notification (no sandbox entitlements needed).
import Foundation

struct Settings: Equatable {
    var pageSize = 6                 // candidates per page (digits 1..N pick)
    var inlinePreview = true         // show the highlighted word inside the text (underlined) while typing
    var showLatin = true             // pinned last row "as typed", key 0
    var autoSpace = true             // add a space after picking with a number
    var persianDigits = true         // 0-9 -> ۰-۹ when not composing
    var mapPunct = true              // , ; ? -> ، ؛ ؟
    var context = true               // previous word steers ranking
    var learn = true                 // remember my choices
    var zwnj = "off"                 // "off" (joined letters) | "auto" (add the half-space where Persian spelling uses it); shown as one checkbox
    var onlySpaceCommits = true      // experiment: signs stay inside the word; Space / Enter / 0 commit
    var wordSigns = Settings.defaultWordSigns   // which signs stay inside a word (only used when onlySpaceCommits is on)
    var maxCandidates = 18
    var unloadAfterMinutes = 5       // free the engine's memory this long after the keyboard is switched away from (0 = never)
}

extension Settings {
    /// every printable ASCII sign except the apostrophe (which is already part of Finglish: ma'ni) — letters and digits are never signs
    static let defaultWordSigns = "!\"#$%&()*+,-./:;<=>?@[\\]^_`{|}~"
}

extension Settings: Codable {
    enum CodingKeys: String, CodingKey {
        case pageSize, inlinePreview, showLatin, autoSpace, persianDigits, mapPunct, context, learn, zwnj
        case onlySpaceCommits, wordSigns, maxCandidates, unloadAfterMinutes
    }
    /// Missing keys (older files, new settings) fall back to the defaults above.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        var s = Settings()
        s.pageSize = try c.decodeIfPresent(Int.self, forKey: .pageSize) ?? s.pageSize
        s.inlinePreview = try c.decodeIfPresent(Bool.self, forKey: .inlinePreview) ?? s.inlinePreview
        s.showLatin = try c.decodeIfPresent(Bool.self, forKey: .showLatin) ?? s.showLatin
        s.autoSpace = try c.decodeIfPresent(Bool.self, forKey: .autoSpace) ?? s.autoSpace
        s.persianDigits = try c.decodeIfPresent(Bool.self, forKey: .persianDigits) ?? s.persianDigits
        s.mapPunct = try c.decodeIfPresent(Bool.self, forKey: .mapPunct) ?? s.mapPunct
        s.context = try c.decodeIfPresent(Bool.self, forKey: .context) ?? s.context
        s.learn = try c.decodeIfPresent(Bool.self, forKey: .learn) ?? s.learn
        s.zwnj = try c.decodeIfPresent(String.self, forKey: .zwnj) ?? s.zwnj
        s.onlySpaceCommits = try c.decodeIfPresent(Bool.self, forKey: .onlySpaceCommits) ?? s.onlySpaceCommits
        s.wordSigns = try c.decodeIfPresent(String.self, forKey: .wordSigns) ?? s.wordSigns
        s.maxCandidates = try c.decodeIfPresent(Int.self, forKey: .maxCandidates) ?? s.maxCandidates
        s.unloadAfterMinutes = try c.decodeIfPresent(Int.self, forKey: .unloadAfterMinutes) ?? s.unloadAfterMinutes
        s.pageSize = min(9, max(3, s.pageSize))
        self = s
    }
}

enum UserFiles {
    /// ~/Library/Application Support/Finglish Keyboard (override with FINGLISH_SUPPORT_DIR, used by the tests)
    static var dir: URL {
        if let o = ProcessInfo.processInfo.environment["FINGLISH_SUPPORT_DIR"] { return URL(fileURLWithPath: o, isDirectory: true) }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Finglish Keyboard", isDirectory: true)
    }
    static var settings: URL { dir.appendingPathComponent("settings.json") }
    static var learned: URL { dir.appendingPathComponent("learned.json") }
    static let changedName = Notification.Name("com.finglish.keyboard.settingsChanged")

    static func ensureDir() { try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }

    static func loadSettings() -> Settings {
        guard let d = try? Data(contentsOf: settings), let s = try? JSONDecoder().decode(Settings.self, from: d) else { return Settings() }
        return s
    }
    static func saveSettings(_ s: Settings, notify: Bool = true) {
        ensureDir()
        let enc = JSONEncoder(); enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        if let d = try? enc.encode(s) { try? d.write(to: settings, options: .atomic) }
        if notify { DistributedNotificationCenter.default().postNotificationName(changedName, object: nil, userInfo: nil, deliverImmediately: true) }
    }
    static func loadText(_ url: URL) -> String { (try? String(contentsOf: url, encoding: .utf8)) ?? "" }
    static func saveText(_ s: String, to url: URL, notify: Bool = true) {
        ensureDir()
        try? s.write(to: url, atomically: true, encoding: .utf8)
        if notify { DistributedNotificationCenter.default().postNotificationName(changedName, object: nil, userInfo: nil, deliverImmediately: true) }
    }
}
