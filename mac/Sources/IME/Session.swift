// The typing logic of the keyboard as a plain Swift class — no UI, no InputMethodKit — so it can be tested without installing anything.
// It is the Swift twin of assets/js/ime.js (the website's controller); that file's header and tests/e2e/smoke.js are its specification.
//
//   letters start a "word" (shown as underlined marked text) and a candidate list; Space / Enter / 1-9 commit (+ space);
//   0 commits the typed Latin as typed (the pinned last row); ↓ ↑ move the highlight; PageUp/Down page; Esc cancels; Backspace edits;
//   experiment `onlySpaceCommits`: signs do not end the word. Signs only AFTER the letters ("salam?") stay attached to the Persian word
//   (the list still offers Persian candidates, rows show سلام؟, Space commits that, 0 commits the English as typed); letters or digits
//   AFTER a sign ("me@example.com") make it literal text: nothing is converted, only the "as typed" row is offered.
import Foundation

struct Candidate: Equatable {
    var text: String
    var kind: String        // "lex" | "oov" | "morph" | "alias" | "latin"
    var score: Double = 0
}

protocol EngineProviding: AnyObject {
    var isReady: Bool { get }
    /// Ranked Persian candidates for the typed Latin; [] when the engine is not loaded yet.
    func candidates(latin: String, prev: String, max: Int) -> [Candidate]
    func learn(latin: String, persian: String)
}

/// What the candidate window shows.
struct CandidateModel: Equatable {
    var raw: String                 // the typed text (header)
    var rows: [String]              // Persian candidates of the current page, numbered 1…
    var selectedRow: Int?           // index in `rows`
    var latin: String?              // the pinned "as typed" row (key 0); nil when switched off
    var latinSelected: Bool
    var page: Int
    var pages: Int
    var firstIndex: Int = 0         // absolute index (for Session.pick) of rows[0]
    var latinIndex: Int = 0         // absolute index of the Latin row
    var label: String               // "", "as typed", "loading…"
}

protocol SessionClient: AnyObject {
    func setMarked(_ text: String)      // underlined text inside the document ("" clears it)
    func commit(_ text: String)         // insert final text, replacing the marked text
    func textBeforeCaret() -> String    // for the previous-word context
    func show(_ model: CandidateModel?) // nil hides the window
}

enum Key: Equatable {
    case char(Character)
    case space, halfSpace, enter, backspace, delete, escape, tab, shiftTab, up, down, left, right, pageUp, pageDown
}

final class Session {
    var settings: Settings
    let engine: EngineProviding
    weak var client: SessionClient?

    struct Word {
        var raw: String             // exactly as typed (capitals kept: it may be English)
        var buf: String             // lower-case, what the engine sees
        var cands: [Candidate] = []
        var sel = 0                 // 0..<cands.count = Persian candidate, cands.count = the Latin row
        var page = 0
        var loading = false
    }
    private(set) var word: Word?
    var isComposing: Bool { word != nil }

    static let persianDigits: [Character] = Array("۰۱۲۳۴۵۶۷۸۹")
    static let punct: [Character: String] = [",": "،", ";": "؛", "?": "؟"]

    init(settings: Settings, engine: EngineProviding) { self.settings = settings; self.engine = engine }

    // MARK: key entry point — returns true when the key was consumed
    func handle(_ key: Key) -> Bool {
        word == nil ? handleIdle(key) : handleComposing(key)
    }

    static let halfSpace = "\u{200C}"                                   // ZWNJ, نیم‌فاصله

    private func handleIdle(_ key: Key) -> Bool {
        if key == .halfSpace { client?.commit(Session.halfSpace); return true }          // Shift+Space with nothing typed: just the half-space
        guard case .char(let c) = key else { return false }
        if c.isASCII && c.isLetter { begin(c); return true }
        if settings.mapPunct, let p = Session.punct[c] { client?.commit(p); return true }
        if settings.persianDigits, let d = digit(c) { client?.commit(String(Session.persianDigits[d])); return true }
        return false
    }

    private func handleComposing(_ key: Key) -> Bool {
        guard let w = word else { return false }
        let ps = settings.pageSize
        switch key {
        case .char(let ch):
            if ch.isASCII && (ch.isLetter || ch == "'") { setRaw(w.raw + String(ch)); refresh(); return true }
            if settings.onlySpaceCommits {
                let sign = settings.wordSigns.contains(ch)          // the configurable list (Settings → signs that stay inside a word)
                if sign || (digit(ch).map { $0 >= 1 } == true && isLiteral(w.raw)) { setRaw(w.raw + String(ch)); refresh(); return true }
            }
            if let d = digit(ch), d >= 1 {                        // 1-9: pick that Persian candidate
                let i = w.page * ps + d - 1
                if i < w.cands.count { commit(i, settings.autoSpace ? " " : "") }
                return true
            }
            if ch == "0" && settings.showLatin {                  // 0: the typed Latin, exactly as typed
                commit(w.cands.count, settings.autoSpace ? " " : ""); return true
            }
            if settings.mapPunct, let p = Session.punct[ch] { commit(w.sel, p); return true }
            if settings.persianDigits, let d = digit(ch) { commit(w.sel, String(Session.persianDigits[d])); return true }
            commit(w.sel, "")                                      // any other key: commit, then let the key through
            return false
        case .backspace:
            if w.raw.count > 1 { setRaw(String(w.raw.dropLast())); refresh() } else { cancel() }
            return true
        case .delete: return true
        case .space, .enter: commit(w.sel, " "); return true
        case .halfSpace: commit(w.sel, isLiteral(w.raw) ? " " : Session.halfSpace); return true      // the word, then a half-space instead of a space; literal text (e-mails…) gets a plain space
        case .escape: cancel(); return true
        case .tab, .down, .right: move(1); return true
        case .shiftTab, .up, .left: move(-1); return true
        case .pageDown: if !w.cands.isEmpty { select(min(w.cands.count - 1, (w.page + 1) * ps)) }; return true
        case .pageUp: if !w.cands.isEmpty { select(max(0, (w.page - 1) * ps)) }; return true
        }
    }

    // MARK: composition lifecycle
    private func begin(_ c: Character) {
        word = Word(raw: String(c), buf: String(c).lowercased())
        refresh()
    }

    private func setRaw(_ raw: String) { word?.raw = raw; word?.buf = raw.lowercased() }

    /// What was typed, split into the Finglish letters (`head`) and what follows them (`tail`). `literal` = letters or digits come
    /// AFTER a sign (e-mail, link): text to keep, not Finglish to convert. A tail of only signs stays attached to the Persian word.
    struct Parts { var head: String; var tail: String; var literal: Bool }
    func parts(of raw: String) -> Parts {
        guard settings.onlySpaceCommits else { return Parts(head: raw, tail: "", literal: false) }
        let head = String(raw.prefix { $0.isASCII && ($0.isLetter || $0 == "'") })
        let tail = String(raw.dropFirst(head.count))
        if tail.isEmpty { return Parts(head: head, tail: "", literal: false) }
        return Parts(head: head, tail: tail, literal: !tail.allSatisfy { settings.wordSigns.contains($0) })
    }
    func isLiteral(_ raw: String) -> Bool { parts(of: raw).literal }

    /// The signs typed after the word as they will appear after the Persian word (? → ؟ when Persian punctuation is on).
    private func tailText(_ raw: String) -> String {
        let p = parts(of: raw)
        if p.literal || p.tail.isEmpty { return "" }
        return settings.mapPunct ? p.tail.map { Session.punct[$0] ?? String($0) }.joined() : p.tail
    }

    private func refresh() {
        guard var w = word else { return }
        let p = parts(of: w.raw)
        if p.literal { apply([]); return }                           // nothing to convert: the engine is not asked
        if !engine.isReady {
            w.loading = true; w.cands = []; w.sel = 0; w.page = 0; word = w
            client?.setMarked(w.raw); render(); return
        }
        let prev = settings.context ? (client?.textBeforeCaret() ?? "") : ""
        apply(engine.candidates(latin: p.head.lowercased(), prev: prev, max: settings.maxCandidates))   // only the letters are converted
    }

    private func apply(_ list: [Candidate]) {
        guard var w = word else { return }
        w.cands = list; w.sel = 0; w.page = 0; w.loading = false; word = w
        client?.setMarked(preview()); render()
    }

    /// The engine finished loading while a word was being typed: ask again.
    func engineBecameReady() { if word?.loading == true { refresh() } }

    private func total() -> Int { (word?.cands.count ?? 0) + (settings.showLatin ? 1 : 0) }

    private func candAt(_ i: Int) -> Candidate {
        guard let w = word else { return Candidate(text: "", kind: "latin") }
        guard i < w.cands.count else { return Candidate(text: w.raw, kind: "latin") }
        var c = w.cands[i]
        c.text += tailText(w.raw)                                    // what will be inserted: the word + its signs
        return c
    }

    private func preview() -> String {
        guard let w = word else { return "" }
        return settings.inlinePreview ? candAt(w.sel).text : w.raw
    }

    private func move(_ d: Int) {
        guard let w = word else { return }
        let n = total()
        if n > 0 { select((w.sel + d + n) % n) }
    }

    private func select(_ i: Int) {
        guard var w = word, total() > 0 else { return }
        w.sel = i
        if i < w.cands.count { w.page = i / settings.pageSize }       // the Latin row belongs to every page
        word = w
        client?.setMarked(preview()); render()
    }

    private func commit(_ i: Int, _ suffix: String) {
        guard let w = word else { return }
        let c = candAt(i)
        let base: String? = i < w.cands.count ? w.cands[i].text : nil     // the word without its signs (what learning remembers)
        let head = parts(of: w.raw).head.lowercased()
        word = nil
        client?.show(nil)
        client?.commit(c.text + suffix)
        if let base = base, settings.learn { engine.learn(latin: head, persian: base) }
    }

    private func cancel() {
        word = nil
        client?.show(nil)
        client?.setMarked("")
    }

    /// Commit what is highlighted (focus lost, a shortcut key, Persian typing switched off).
    func finish() { if let w = word { commit(w.sel, "") } }

    /// Mouse click on a row of the candidate window (index = position among the Persian candidates; cands.count = the Latin row).
    func pick(_ index: Int) { commit(index, settings.autoSpace ? " " : "") }

    // MARK: window model
    private func render() {
        guard let w = word else { client?.show(nil); return }
        let n = w.cands.count, ps = settings.pageSize
        let first = w.page * ps
        let tail = tailText(w.raw)
        let rows = n > first ? w.cands[first..<min(n, first + ps)].map { $0.text + tail } : []
        let label = w.loading ? "loading…" : (isLiteral(w.raw) ? "as typed" : "")
        client?.show(CandidateModel(raw: w.raw, rows: Array(rows),
                                    selectedRow: (w.sel < n) ? w.sel - first : nil,
                                    latin: settings.showLatin ? w.raw : nil, latinSelected: settings.showLatin && w.sel == n,
                                    page: w.page, pages: max(1, (n + ps - 1) / ps), firstIndex: first, latinIndex: n, label: label))
    }

    // MARK: helpers
    private func digit(_ c: Character) -> Int? { c.isASCII ? c.wholeNumberValue : nil }
    private func printable(_ c: Character) -> Bool { (c.asciiValue ?? 0) >= 0x21 && (c.asciiValue ?? 0) <= 0x7E }
}
