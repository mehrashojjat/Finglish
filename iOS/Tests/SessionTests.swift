import Foundation

final class FakeEngine: EngineProviding {
    var isReady = true

    func candidates(latin: String, prev: String, max: Int) -> [Candidate] {
        [
            Candidate(text: "سلام", kind: "lex"),
            Candidate(text: "سالم", kind: "lex"),
            Candidate(text: "سَلَام", kind: "oov"),
            Candidate(text: "سلامت", kind: "lex")
        ].prefix(max).map { $0 }
    }

    func learn(latin: String, persian: String) {}
}

final class TestClient: SessionClient {
    var marked = ""
    var committed = [String]()
    var latest: CandidateModel?

    func setMarked(_ text: String) { marked = text }
    func commit(_ text: String) { committed.append(text) }
    func textBeforeCaret() -> String { "" }
    func show(_ model: CandidateModel?) { latest = model }
}

func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    guard condition() else {
        fputs("FAIL: \(message)\n", stderr)
        exit(1)
    }
}

var settings = Settings()
settings.pageSize = 3
settings.maxCandidates = 3
let engine = FakeEngine()
let client = TestClient()
let session = Session(settings: settings, engine: engine)
session.client = client

check(session.handle(.char("s")), "first letter should begin a composition")
_ = session.handle(.char("a"))
_ = session.handle(.char("l"))
_ = session.handle(.char("a"))
_ = session.handle(.char("m"))
check(client.latest?.rows == ["سلام", "سالم", "سَلَام"], "the suggestion bar must contain only the top three")
check(client.marked == "سلام", "the first candidate should be the inline preview")
_ = session.handle(.space)
check(client.committed == ["سلام "], "Space should commit the selected candidate and add a space")

client.committed.removeAll()
_ = session.handle(.char("m"))
_ = session.handle(.char("e"))
_ = session.handle(.char("@"))
_ = session.handle(.char("e"))
check(client.latest?.label == "as typed", "text after a sign should stay literal")
check(client.latest?.rows.isEmpty == true, "literal text should not query the engine")
_ = session.handle(.space)
check(client.committed == ["me@e "], "literal text should commit unchanged")

print("PASS iOS session tests")
