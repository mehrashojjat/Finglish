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

    private static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroup) ?? .standard
    }

    static func loadSettings() -> Settings {
        guard let data = defaults.data(forKey: settingsKey), let settings = try? JSONDecoder().decode(Settings.self, from: data) else {
            return Settings()
        }
        return settings
    }

    static func saveSettings(_ settings: Settings) {
        guard let data = try? JSONEncoder().encode(settings) else { return }
        defaults.set(data, forKey: settingsKey)
        defaults.synchronize()
    }

    static func loadLearned() -> String {
        defaults.string(forKey: learnedKey) ?? ""
    }

    static func saveLearned(_ text: String) {
        defaults.set(text, forKey: learnedKey)
        defaults.synchronize()
    }

    static func forgetLearned() {
        defaults.removeObject(forKey: learnedKey)
        defaults.synchronize()
    }
}
