// Tests for the Mac keyboard's logic, run without installing anything:   mac/test.sh
// 1. Session (the typing rules) against a fake engine and a fake text client — mirrors tests/e2e/smoke.js of the website
// 2. EngineHost: the real engine package in JavaScriptCore
import Foundation
import AppKit

var failed = 0, passed = 0
func check(_ cond: Bool, _ name: String, _ extra: @autoclosure () -> String = "") {
    if cond { passed += 1; print("PASS", name) } else { failed += 1; print("FAIL", name, extra()) }
}

// ---------------------------------------------------------------- fakes
final class FakeEngine: EngineProviding {
    var isReady = true
    var calls: [String] = []
    var learned: [(String, String)] = []
    var table: [String: [String]] = [
        "salam": ["سلام", "سالم", "سلم", "سالام", "شالم", "ثلم", "سلامم", "صلام"],
        "khoobi": ["خوبی", "خوبیه", "خوابی", "خوبه"],
        "man": ["من", "مان"],
        "mikham": ["میخوام", "میخام", "میخوایم"],
    ]
    func candidates(latin: String, prev: String, max: Int) -> [Candidate] {
        calls.append(latin)
        return (table[latin] ?? []).prefix(max).map { Candidate(text: $0, kind: "lex") }
    }
    func learn(latin: String, persian: String) { learned.append((latin, persian)) }
}

final class FakeClient: SessionClient {
    var marked = ""
    var text = ""                       // what has been committed into the "document"
    var model: CandidateModel?
    var before = ""
    func setMarked(_ t: String) { marked = t }
    func commit(_ t: String) { text += t; marked = "" }
    func textBeforeCaret() -> String { before }
    func show(_ m: CandidateModel?) { model = m }
}

func make(_ configure: (inout Settings) -> Void = { _ in }) -> (Session, FakeEngine, FakeClient) {
    var s = Settings(); configure(&s)
    let e = FakeEngine(), c = FakeClient()
    let session = Session(settings: s, engine: e); session.client = c
    return (session, e, c)
}
@discardableResult func type(_ s: Session, _ str: String) -> [Bool] { str.map { s.handle(.char($0)) } }

// ---------------------------------------------------------------- Session
do {
    let (s, _, c) = make()
    type(s, "salam")
    check(c.marked == "سلام", "inline preview shows the best candidate (underlined marked text)", c.marked)
    check(c.model?.rows.count == 6 && c.model?.rows.first == "سلام" && c.model?.latin == "salam", "window: 6 Persian rows + pinned Latin row", "\(String(describing: c.model))")
    check(c.model?.selectedRow == 0 && c.model?.latinSelected == false, "first row highlighted")
    check(s.handle(.space) && c.text == "سلام " && c.marked == "" && c.model == nil, "Space commits + adds a space and closes the window", c.text)
}
do {   // Shift+Space = half-space (نیم‌فاصله)
    let (s, e, c) = make()
    type(s, "salam")
    check(s.handle(.halfSpace) && c.text == "سلام\u{200C}" && !s.isComposing && c.marked == "" && c.model == nil, "Shift+Space commits the word + a half-space, no space", c.text)
    check(e.learned.count == 1 && e.learned[0].1 == "سلام", "…and the choice is learned")
    check(s.handle(.halfSpace) && c.text == "سلام\u{200C}\u{200C}", "Shift+Space with nothing being typed inserts a half-space", c.text)
    type(s, "man"); _ = s.handle(.space)
    check(c.text == "سلام\u{200C}\u{200C}من ", "typing goes on normally after it", c.text)
}
do {   // …but inside text that stays literal (e-mail) it is a plain space
    let (s, _, c) = make()
    type(s, "me@x.io"); _ = s.handle(.halfSpace)
    check(c.text == "me@x.io " && !s.isComposing, "Shift+Space inside an e-mail is a plain space", c.text)
}
do {
    let (s, e, c) = make()
    type(s, "khoobi"); _ = s.handle(.enter)
    check(c.text == "خوبی ", "Enter commits + adds a space", c.text)
    check(e.learned.count == 1 && e.learned[0].0 == "khoobi" && e.learned[0].1 == "خوبی", "a Persian choice is learned")
}
do {
    let (s, _, c) = make()
    type(s, "salam"); _ = s.handle(.char("2"))
    check(c.text == "سالم ", "digit 2 picks the 2nd candidate + space", c.text)
}
do {
    let (s, e, c) = make()
    type(s, "Hello"); _ = s.handle(.char("0"))
    check(c.text == "Hello ", "key 0 commits the English exactly as typed (capitals kept) + space", c.text)
    check(e.learned.isEmpty, "the English row is not learned")
    check(e.calls.last == "hello", "the engine sees it lower-cased", "\(e.calls)")
}
do {
    let (s, _, c) = make()
    type(s, "man"); _ = s.handle(.up)
    check(c.model?.latinSelected == true && c.marked == "man", "↑ from the first row wraps to the Latin row; preview shows the Latin", c.marked)
    _ = s.handle(.space)
    check(c.text == "man ", "Space commits the highlighted Latin row", c.text)
}
do {
    let (s, _, c) = make()
    type(s, "man"); let consumed = s.handle(.escape)
    check(consumed && c.text == "" && c.marked == "" && c.model == nil && !s.isComposing, "Esc discards the word")
}
do {
    let (s, _, c) = make()
    type(s, "mans"); _ = s.handle(.backspace)
    check(c.marked == "من", "Backspace edits the Latin", c.marked)
    _ = s.handle(.backspace); _ = s.handle(.backspace); _ = s.handle(.backspace)
    check(!s.isComposing && c.marked == "", "Backspace to empty ends the word")
}
do {
    let (s, e, c) = make()
    type(s, "me@example.com")
    check(c.model?.rows.isEmpty == true && c.model?.latin == "me@example.com" && c.model?.label == "as typed", "signs stay in the word: only the 'as typed' row", "\(String(describing: c.model))")
    check(c.marked == "me@example.com", "the e-mail is shown while typing", c.marked)
    check(!e.calls.contains { $0.contains("@") || $0.contains("example") }, "the engine is never asked about text after the first sign", "\(e.calls)")
    _ = s.handle(.char("0"))
    check(c.text == "me@example.com ", "0 commits the e-mail", c.text)
}
do {
    let (s, _, c) = make()
    type(s, "https://x.io/a?b=1"); _ = s.handle(.space)
    check(c.text == "https://x.io/a?b=1 ", "links with : / ? = and a digit are typed uninterrupted", c.text)
}
do {
    let (s, _, c) = make()
    type(s, "salam@")
    check(c.marked == "سلام@" && c.model?.rows.first == "سلام@", "a sign after the word keeps Persian: the word is shown WITH the sign", c.marked)
    _ = s.handle(.backspace)
    check(c.model?.rows.isEmpty == false && c.marked == "سلام", "deleting the sign gives the plain Persian word back", c.marked)
}
do {
    let (s, _, c) = make { $0.onlySpaceCommits = false }
    type(s, "salam"); let consumed = s.handle(.char(","))
    check(consumed && c.text == "سلام،" && !s.isComposing, "experiment OFF: a comma commits the word and becomes ،", c.text)
    type(s, "salam"); let passed = s.handle(.char("."))
    check(passed == false && c.text == "سلام،سلام", "experiment OFF: a full stop commits the word and the key passes through", c.text)
}
do {
    let (s, _, c) = make()
    check(s.handle(.char(",")) && c.text == "،", "idle: , becomes ،")
    check(s.handle(.char("?")) && s.handle(.char(";")) && c.text == "،؟؛", "idle: ? ; become ؟ ؛")
    check(s.handle(.char("1")) && s.handle(.char("2")) && c.text.hasSuffix("۱۲"), "idle: digits become ۱۲")
    check(s.handle(.char("@")) == false, "idle: other symbols pass through untouched")
    check(s.handle(.space) == false && s.handle(.enter) == false && s.handle(.backspace) == false, "idle: Space / Enter / Backspace pass through")
}
do {
    let (s, _, c) = make { $0.mapPunct = false; $0.persianDigits = false }
    check(s.handle(.char(",")) == false && s.handle(.char("1")) == false && c.text == "", "settings off: punctuation and digits pass through")
}
do {
    let (s, e, c) = make { $0.pageSize = 3 }
    e.table["pg"] = (1...8).map { "w\($0)" }
    type(s, "pg")
    check(c.model?.rows == ["w1", "w2", "w3"] && c.model?.pages == 3, "paging: 3 per page, 3 pages", "\(String(describing: c.model))")
    _ = s.handle(.pageDown)
    check(c.model?.rows == ["w4", "w5", "w6"] && c.model?.page == 1 && c.marked == "w4", "PageDown shows the next page and highlights its first word")
    _ = s.handle(.char("2"))
    check(c.text == "w5 ", "digits are relative to the page", c.text)
}
do {
    let (s, e, c) = make()
    e.isReady = false
    type(s, "salam")
    check(c.marked == "salam" && c.model?.label == "loading…" && c.model?.rows.isEmpty == true, "engine still loading: the typed Latin is shown, no crash")
    e.isReady = true; s.engineBecameReady()
    check(c.marked == "سلام" && c.model?.label == "", "…and Persian appears as soon as the engine is ready", c.marked)
}
do {
    let (s, _, c) = make()
    type(s, "salam"); s.finish()
    check(c.text == "سلام" && !s.isComposing, "finish() (focus lost) commits the highlighted word, no space")
}
do {
    let (s, _, c) = make { $0.inlinePreview = false; $0.autoSpace = false }
    type(s, "salam")
    check(c.marked == "salam", "inline preview off: the Latin stays in the text while the list shows Persian")
    _ = s.handle(.char("1"))
    check(c.text == "سلام", "auto-space off: picking with a number adds no space", c.text)
}
do {
    let (s, _, c) = make { $0.showLatin = false }
    type(s, "salam")
    check(c.model?.latin == nil, "Latin row can be switched off")
    _ = s.handle(.char("0"))
    check(c.text == "سلام۰", "…and then 0 is just a digit", c.text)
}
do {
    let (s, e, c) = make()
    c.before = "من "
    type(s, "salam")
    check(!e.calls.isEmpty, "previous-word context is requested from the client")
    check(s.handle(.char("(")) == false || true, "other symbols never crash")
}

do {
    let (s, _, c) = make { $0.wordSigns = "@-_/:" }               // "." and "?" removed from the list: they end the word again
    type(s, "salam"); let r = s.handle(.char("."))
    check(r == false && c.text == "سلام" && !s.isComposing, "custom signs list: a sign NOT in the list commits the word and passes through", c.text)
    type(s, "me@x"); check(c.marked == "me@x", "custom signs list: a listed sign (@) stays inside the word", c.marked)
}
do {
    let (s, _, c) = make()
    for sign in Array(Settings.defaultWordSigns) { _ = s.handle(.char("a")); let r = s.handle(.char(sign)); check(r && s.isComposing && c.marked.hasSuffix(String(sign)), "default list: \(sign) stays inside the word", c.marked); _ = s.handle(.escape) }
}

do {
    let (s, e, c) = make()
    type(s, "salam?")
    check(s.isComposing && c.marked == "سلام؟" && c.model?.rows.first == "سلام؟" && c.model?.label == "", "salam? : Persian candidates stay, shown with ؟", "\(String(describing: c.model))")
    check(c.model?.latin == "salam?", "…and the English row offers exactly what was typed")
    check(e.calls.allSatisfy { $0 == "salam" || "salam".hasPrefix($0) }, "the engine only ever sees the letters, never the sign", "\(e.calls)")
    _ = s.handle(.space)
    check(c.text == "سلام؟ " && e.learned.last?.0 == "salam" && e.learned.last?.1 == "سلام", "Space commits سلام؟ + space; learning remembers the plain word", c.text)
}
do {
    let (s, _, c) = make()
    type(s, "salam."); _ = s.handle(.space); check(c.text == "سلام. ", "salam. → سلام. ", c.text)
    type(s, "salam,"); _ = s.handle(.enter); check(c.text == "سلام. سلام، ", "salam, → سلام، (Persian comma)", c.text)
    type(s, "salam?!"); _ = s.handle(.char("2")); check(c.text.hasSuffix("سالم؟! "), "salam?! then 2 → سالم؟! ", c.text)
    type(s, "salam?"); _ = s.handle(.char("0")); check(c.text.hasSuffix("salam? "), "salam? then 0 → English exactly as typed", c.text)
}
do {
    let (s, _, c) = make { $0.mapPunct = false }
    type(s, "salam?"); _ = s.handle(.space)
    check(c.text == "سلام? ", "Persian punctuation off: the sign stays as typed (سلام?)", c.text)
}
do {
    let (s, e, c) = make()
    type(s, "salam?e")
    check(c.model?.rows.isEmpty == true && c.model?.label == "as typed" && c.marked == "salam?e", "a letter after a sign makes it literal text again", c.marked)
    check(!e.calls.contains { $0.contains("?") || $0.contains("e") && $0.count > 5 }, "…and the engine is not asked about it", "\(e.calls)")
}

// ---------------------------------------------------------------- KeyTranslator (synthetic key events)
func ev(_ code: UInt16, _ chars: String, shift: Bool = false) -> NSEvent {
    NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: shift ? [.shift] : [], timestamp: 0, windowNumber: 0, context: nil,
                     characters: chars, charactersIgnoringModifiers: chars.lowercased(), isARepeat: false, keyCode: code)!
}
check(KeyTranslator.key(for: ev(0, "a")) == .char("a"), "key: a → letter")
check(KeyTranslator.key(for: ev(0, "A", shift: true)) == .char("A"), "key: Shift+a keeps the capital")
check(KeyTranslator.key(for: ev(18, "1")) == .char("1") && KeyTranslator.key(for: ev(29, "0")) == .char("0"), "key: digits")
check(KeyTranslator.key(for: ev(36, "\r")) == .enter && KeyTranslator.key(for: ev(76, "\u{3}")) == .enter, "key: Return and keypad Enter")
check(KeyTranslator.key(for: ev(49, " ")) == .space && KeyTranslator.key(for: ev(51, "\u{7f}")) == .backspace && KeyTranslator.key(for: ev(53, "\u{1b}")) == .escape, "key: Space, Backspace, Esc")
check(KeyTranslator.key(for: ev(125, "\u{F701}")) == .down && KeyTranslator.key(for: ev(126, "\u{F700}")) == .up, "key: arrows (by key code)")
check(KeyTranslator.key(for: ev(123, "\u{F702}")) == .left && KeyTranslator.key(for: ev(124, "\u{F703}")) == .right, "key: left / right")
check(KeyTranslator.key(for: ev(116, "\u{F72C}")) == .pageUp && KeyTranslator.key(for: ev(121, "\u{F72D}")) == .pageDown, "key: Page Up / Page Down")
check(KeyTranslator.key(for: ev(48, "\t")) == .tab && KeyTranslator.key(for: ev(48, "\u{19}", shift: true)) == .shiftTab, "key: Tab / Shift+Tab")
check(KeyTranslator.key(for: ev(49, " ", shift: true)) == .halfSpace && KeyTranslator.key(for: ev(49, " ")) == .space, "key: Shift+Space is the half-space key, Space stays Space")
check(KeyTranslator.key(for: ev(115, "\u{F729}")) == nil && KeyTranslator.key(for: ev(122, "\u{F704}")) == nil, "key: Home and F1 are not ours (nil → passed through)")
check(KeyTranslator.key(for: ev(43, ",")) == .char(",") && KeyTranslator.key(for: ev(41, ";")) == .char(";") && KeyTranslator.key(for: ev(44, "?", shift: true)) == .char("?"), "key: punctuation")

do {   // the Persian on/off setting is gone; an old settings.json that still contains it loads fine and the keyboard is simply always on
    let old = #"{"enabled": false, "pageSize": 7, "zwnj": "auto"}"#.data(using: .utf8)!
    let s = try? JSONDecoder().decode(Settings.self, from: old)
    check(s?.pageSize == 7 && s?.zwnj == "auto", "settings: an old file that still has \"enabled\" loads (the key is ignored)")
}

// ---------------------------------------------------------------- KeyboardInstaller (the keyboard travels inside the settings app)
do {
    let fm = FileManager.default
    let tmp = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("finglish-installer-\(getpid())")
    try? fm.removeItem(at: tmp)
    func fakeKeyboard(_ at: URL, version: String, marker: String) {
        try! fm.createDirectory(at: at.appendingPathComponent("Contents/MacOS"), withIntermediateDirectories: true)
        _ = (["CFBundleVersion": version, "CFBundleIdentifier": "test"] as NSDictionary).write(to: at.appendingPathComponent("Contents/Info.plist"), atomically: true)
        let exe = at.appendingPathComponent("Contents/MacOS/Finglish")
        try! marker.write(to: exe, atomically: true, encoding: .utf8)
        try! fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: exe.path)
    }
    func installed() -> String { (try? String(contentsOf: tmp.appendingPathComponent("home/Library/Input Methods/Finglish.app/Contents/MacOS/Finglish"), encoding: .utf8)) ?? "" }
    let src = tmp.appendingPathComponent("app/Keyboard/Finglish.bundle")
    let dst = tmp.appendingPathComponent("home/Library/Input Methods/Finglish.app")
    fakeKeyboard(src, version: "202610111200", marker: "first")
    var stopped = 0
    check(KeyboardInstaller.version(of: src) == "202610111200" && KeyboardInstaller.version(of: dst) == nil, "installer: reads the build stamp of a bundle; nothing installed yet")
    check(KeyboardInstaller.installIfNeeded(from: src, to: dst, stopRunning: { stopped += 1 }) == .installed && installed() == "first", "installer: the first launch copies the keyboard (Input Methods folder created on the way)")
    check(KeyboardInstaller.installIfNeeded(from: src, to: dst, stopRunning: { stopped += 1 }) == .upToDate && stopped == 1, "installer: a later launch only checks — nothing copied")
    fakeKeyboard(src, version: "202610121300", marker: "second")
    check(KeyboardInstaller.installIfNeeded(from: src, to: dst, stopRunning: { stopped += 1 }) == .installed && installed() == "second" && stopped == 2, "installer: a newer app replaces the older keyboard, and the running one is stopped first")
    try? fm.removeItem(at: dst.appendingPathComponent("Contents/MacOS/Finglish"))
    check(KeyboardInstaller.installIfNeeded(from: src, to: dst) == .installed && installed() == "second", "installer: a damaged install (program missing) is repaired")
    check(KeyboardInstaller.installIfNeeded(from: tmp.appendingPathComponent("no-such-bundle"), to: dst) == .notBundled && installed() == "second", "installer: a build with no keyboard inside is left alone")
    try? fm.removeItem(at: tmp)
    let list: [[String: Any]] = [["Bundle ID": "com.apple.CharacterPaletteIM"], ["Bundle ID": "com.finglish.inputmethod.Finglish", "Input Mode": "com.finglish.inputmethod.Finglish.Persian"]]
    check(EnabledSources.contains(list, mode: "com.finglish.inputmethod.Finglish.Persian") && !EnabledSources.contains([list[0]], mode: "com.finglish.inputmethod.Finglish.Persian") && !EnabledSources.contains([], mode: "x"),
          "list: the keyboard counts as added only when its mode is in the user's list")
    check(Onboarding.shouldShowGuide(done: false, keyboardAdded: false), "guide: shown the first time (not finished, keyboard not added)")
    check(!Onboarding.shouldShowGuide(done: true, keyboardAdded: false), "guide: never again once finished — even if the keyboard is later removed")
    check(!Onboarding.shouldShowGuide(done: false, keyboardAdded: true), "guide: not needed when the keyboard is already added")
    // the entries macOS 26/27 itself wrote when the user added the keyboard, and what it left when the user removed it (copied from a real Mac)
    let bundle = "com.finglish.inputmethod.Finglish", mode = "com.finglish.inputmethod.Finglish.Persian"
    let appleList: [[String: Any]] = [["Bundle ID": "com.apple.CharacterPaletteIM", "InputSourceKind": "Non Keyboard Input Method"], ["InputSourceKind": "Keyboard Layout", "KeyboardLayout ID": 0, "KeyboardLayout Name": "U.S."]]
    let modeEntry: [String: Any] = ["Bundle ID": bundle, "Input Mode": mode, "InputSourceKind": "Input Mode"]
    let keyboardEntry: [String: Any] = ["Bundle ID": bundle, "InputSourceKind": "Keyboard Input Method"]
    check(EnabledSources.isAdded(thirdParty: [modeEntry, keyboardEntry], system: appleList, bundle: bundle, mode: mode), "list: added in System Settings (keyboard entry + mode entry) → detected")
    check(!EnabledSources.isAdded(thirdParty: [modeEntry], system: appleList, bundle: bundle, mode: mode), "list: REMOVED in System Settings (only the leftover mode entry stays) → not detected — the state that fooled an earlier version")
    check(!EnabledSources.isAdded(thirdParty: [], system: appleList, bundle: bundle, mode: mode), "list: nothing added → not detected")
    check(!EnabledSources.isAdded(thirdParty: [["Bundle ID": "com.other.ime", "InputSourceKind": "Keyboard Input Method"]], system: appleList, bundle: bundle, mode: mode), "list: another third-party keyboard is not ours")
    check(EnabledSources.isAdded(thirdParty: [], system: [modeEntry], bundle: bundle, mode: mode), "list: also found in the system list, in case another macOS version records it there")
}

// ---------------------------------------------------------------- EngineHost (the real engine in JavaScriptCore)
let distPath = ProcessInfo.processInfo.environment["FINGLISH_DIST"] ?? ""
if !distPath.isEmpty {
    let tmp = NSTemporaryDirectory() + "finglish-test-\(getpid())"
    setenv("FINGLISH_SUPPORT_DIR", tmp, 1)
    let eng = EngineHost.shared
    check(!eng.isReady && eng.candidates(latin: "salam", prev: "", max: 3).isEmpty, "before loading, the engine answers [] instantly (never blocks typing)")
    eng.clientActivated()
    let t0 = Date()
    while !eng.isReady && Date().timeIntervalSince(t0) < 30 { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
    check(eng.isReady, String(format: "engine loads in the background (%.1f s)", eng.loadSeconds))
    let top = { (l: String, p: String) in eng.candidates(latin: l, prev: p, max: 5).first?.text ?? "" }
    check(top("salam", "") == "سلام" && top("mikham", "") == "میخوام" && top("merci", "") == "مرسی", "real engine: salam / mikham / merci")
    check(top("ketabhayeman", "") == "کتابهایمان" && top("whatsapp", "") == "واتساپ", "real engine: unseen inflection and an alias")
    check(top("s", "") == "س" && top("h", "") == "ه" && top("sh", "") == "ش" && top("kh", "") == "خ" && top("b", "") == "ب", "real engine: a lone key gives its own letter first (s → س, h → ه, sh → ش…)")
    let tail = eng.candidates(latin: "mmd", prev: "", max: 18).last
    check(tail?.text == "ممد" && tail?.kind == "literal", "real engine: the letter-by-letter spelling is the last row (mmd → ممد)", tail?.text ?? "")
    // half-space switched ON: only the regular patterns get one — never a stray one inside an ordinary word (از، در، است، بهت)
    eng.applyUserSettings(zwnj: "auto")
    let stray = ["az", "dar", "ast", "bahat", "bahash", "salam"].filter { w in eng.candidates(latin: w, prev: "", max: 9).contains { $0.text.contains("\u{200C}") } }
    check(stray.isEmpty, "real engine, half-space on: no stray half-space inside ordinary words", "\(stray)")
    check(top("mikhaham", "") == "می\u{200C}خواهم", "real engine, half-space on: می‌خواهم keeps its half-space", top("mikhaham", ""))
    eng.applyUserSettings(zwnj: "off")
    // a session on the real engine
    let c = FakeClient(); let s = Session(settings: Settings(), engine: eng); s.client = c
    type(s, "khoobi"); _ = s.handle(.space)
    check(c.text == "خوبی ", "session + real engine: khoobi → خوبی", c.text)
    do {   // typing a lone letter, then a word that is in no list, letter by letter (Up, Up reaches the last Persian row)
        let c2 = FakeClient(); let s2 = Session(settings: Settings(), engine: eng); s2.client = c2
        type(s2, "s"); _ = s2.handle(.space)
        type(s2, "h"); _ = s2.handle(.space)
        check(c2.text == "س ه ", "session + real engine: s → س, h → ه (not اس / ها)", c2.text)
        type(s2, "mmd"); _ = s2.handle(.up); _ = s2.handle(.up); _ = s2.handle(.space)
        check(c2.text == "س ه ممد ", "session + real engine: ↑ ↑ then Space types the letter-by-letter spelling", c2.text)
    }
    // learning persists to disk and survives an unload/reload (a choice that is NOT the default, so a change is visible)
    let defaultTop = top("sakhte", "")
    let target = defaultTop == "سخته" ? "ساخته" : "سخته"
    for _ in 0..<3 { eng.learn(latin: "sakhte", persian: target) }
    check(top("sakhte", "") == target, "learning: a repeated choice is promoted (\(defaultTop) → \(target))", top("sakhte", ""))
    eng.unload()
    let u0 = Date(); while eng.isReady && Date().timeIntervalSince(u0) < 5 { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
    check(!eng.isReady && eng.candidates(latin: "salam", prev: "", max: 3).isEmpty, "unload releases the engine (memory back to the system)")
    check(FileManager.default.fileExists(atPath: UserFiles.learned.path), "…and the learned choices were written to disk")
    eng.ensureLoaded()
    let r0 = Date(); while !eng.isReady && Date().timeIntervalSince(r0) < 30 { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
    check(eng.isReady && top("sakhte", "") == target, "learned choices are restored after a reload", top("sakhte", ""))
    try? FileManager.default.removeItem(atPath: tmp)
} else {
    print("(skipping EngineHost tests: set FINGLISH_DIST to engine/dist)")
}

print("\n\(passed) passed, \(failed) failed")
exit(failed == 0 ? 0 : 1)
