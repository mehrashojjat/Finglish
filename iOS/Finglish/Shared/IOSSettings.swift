import Foundation

struct Settings: Codable, Equatable {
    var pageSize = 3
    var inlinePreview = true
    var showLatin = true
    var autoSpace = true
    var persianDigits = true
    var mapPunct = true
    var context = true
    var learn = true
    var zwnj = "off"
    var onlySpaceCommits = true
    var wordSigns = Settings.defaultWordSigns
    var maxCandidates = 3

    static let defaultWordSigns = "!\"#$%&()*+,-./:;<=>?@[\\]^_`{|}~"

    enum CodingKeys: String, CodingKey {
        case pageSize, inlinePreview, showLatin, autoSpace, persianDigits, mapPunct, context, learn, zwnj
        case onlySpaceCommits, wordSigns, maxCandidates
    }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        var s = Settings()
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
        s.pageSize = 3
        s.maxCandidates = 3
        self = s
    }
}

enum SharedStore {
    static let appGroup = "group.com.finglish.ios"
    static let settingsKey = "finglish.settings"
    static let learnedKey = "finglish.learned"
    static let learnedGenerationKey = "finglish.learned.generation"
    private static let localLearnedGenerationKey = "finglish.learned.generation.seen"

    private static var groupDefaults: UserDefaults {
        UserDefaults(suiteName: appGroup) ?? .standard
    }

    private static var localDefaults: UserDefaults { .standard }

    private static var keyboardHasFullAccess = false

    /// A keyboard without Full Access can read the shared container but cannot
    /// reliably write to it. Keep learned choices in the extension's own
    /// sandbox and use the shared generation only as an app-to-keyboard reset
    /// signal. The containing app continues to store settings in the group.
    private static var isKeyboardExtension: Bool {
        Bundle.main.bundleURL.pathExtension == "appex"
    }

    static func setKeyboardFullAccess(_ enabled: Bool) {
        keyboardHasFullAccess = enabled
    }

    static func loadSettings() -> Settings {
        guard let data = groupDefaults.data(forKey: settingsKey), let settings = try? JSONDecoder().decode(Settings.self, from: data) else {
            return Settings()
        }
        return settings
    }

    static func saveSettings(_ settings: Settings) {
        guard let data = try? JSONEncoder().encode(settings) else { return }
        groupDefaults.set(data, forKey: settingsKey)
        groupDefaults.synchronize()
    }

    static func loadLearned() -> String {
        if isKeyboardExtension && !keyboardHasFullAccess {
            let generation = groupDefaults.integer(forKey: learnedGenerationKey)
            if localDefaults.integer(forKey: localLearnedGenerationKey) != generation {
                localDefaults.removeObject(forKey: learnedKey)
                localDefaults.set(generation, forKey: localLearnedGenerationKey)
                localDefaults.synchronize()
            }
            return localDefaults.string(forKey: learnedKey) ?? ""
        }
        return groupDefaults.string(forKey: learnedKey) ?? ""
    }

    static func saveLearned(_ text: String) {
        let store = isKeyboardExtension && !keyboardHasFullAccess ? localDefaults : groupDefaults
        store.set(text, forKey: learnedKey)
        store.synchronize()
    }

    static func forgetLearned() {
        groupDefaults.removeObject(forKey: learnedKey)
        groupDefaults.set(groupDefaults.integer(forKey: learnedGenerationKey) + 1, forKey: learnedGenerationKey)
        groupDefaults.synchronize()
        localDefaults.removeObject(forKey: learnedKey)
        localDefaults.synchronize()
    }

    static var learnedGeneration: Int {
        groupDefaults.integer(forKey: learnedGenerationKey)
    }

}
