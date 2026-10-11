// A minimal macOS host for the engine: exactly what an input-method app's engine layer does.
//   swiftc -swift-version 5 -O tests/swift_host/main.swift -o build/farsi-host-check
//   build/farsi-host-check engine/dist tests/golden/parity_vectors.jsonl
// It embeds JavaScriptCore (the system framework, no dependencies), loads the SHIPPED package (engine/dist), replays every parity
// vector through the string host API and fails on any difference. If this passes, a Mac app that embeds engine/dist behaves
// identically to the website for the same inputs — and any engine/data update reaches both by rebuilding engine/dist.
import Foundation
import JavaScriptCore

setbuf(stdout, nil)
let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: farsi-host-check <engine/dist dir> <parity_vectors.jsonl>"); exit(2) }
let dist = args[1]

func readText(_ path: String) -> String {
    guard let s = try? String(contentsOfFile: path, encoding: .utf8) else { print("cannot read \(path)"); exit(2) }
    return s
}
func ms(_ t: Date) -> Double { Date().timeIntervalSince(t) * 1000 }

guard let ctx = JSContext() else { print("no JSContext"); exit(2) }
var jsErrors = 0
ctx.exceptionHandler = { _, e in jsErrors += 1; print("JS exception:", e?.toString() ?? "?") }

// 1. load the engine bundle and initialise it from the shipped data files
var t = Date()
ctx.evaluateScript(readText(dist + "/farsi-ime-engine.js"))
guard let host = ctx.objectForKeyedSubscript("FarsiIME")?.objectForKeyedSubscript("host"), !host.isUndefined else { print("FarsiIME.host missing"); exit(1) }
let tBundle = ms(t)
let lex = readText(dist + "/lexicon.tsv"), bg = readText(dist + "/bigrams.tsv"), al = readText(dist + "/aliases.tsv")
t = Date()
let initInfo = host.invokeMethod("init", withArguments: [lex, bg, al, "{}"])?.toString() ?? "?"
let tInit = ms(t)
print(String(format: "engine bundle evaluated in %.0f ms; init (lexicon+bigrams+aliases) %.0f ms -> %@", tBundle, tInit, initInfo))

// 2. replay the frozen vectors
var total = 0, bad = 0, lat: [Double] = []
for line in readText(args[2]).split(separator: "\n") {
    guard let obj = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any],
          let input = obj["in"] as? String, let expected = obj["out"] as? [[String: Any]] else { continue }
    let prev = (obj["prev"] as? String) ?? ""
    let t0 = Date()
    let json = host.invokeMethod("candidates", withArguments: [input, prev, 5])?.toString() ?? "[]"
    lat.append(ms(t0))
    let got = (try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [[String: Any]]) ?? []
    total += 1
    var ok = got.count == expected.count
    if ok {
        for (g, e) in zip(got, expected) {
            let gs = (g["score"] as? Double) ?? .nan, es = (e["s"] as? Double) ?? .nan
            if (g["text"] as? String) != (e["t"] as? String) || (g["kind"] as? String) != (e["k"] as? String) || abs(gs - es) > 0.01 { ok = false }
        }
    }
    if !ok {
        bad += 1
        if bad <= 5 { print("MISMATCH for \(input)\(prev.isEmpty ? "" : " (prev \(prev))"): got \(json)") }
    }
}
lat.sort()
func q(_ p: Double) -> Double { lat.isEmpty ? 0 : lat[min(lat.count - 1, Int(p * Double(lat.count)))] }
print(String(format: "parity: %d vectors, %d mismatches   |   per query in JavaScriptCore: median %.1f ms, p95 %.1f ms, max %.1f ms",
             total, bad, q(0.5), q(0.95), lat.last ?? 0))

// 3. the rest of the host API: learning round trip, user shortcuts, options
func top(_ latin: String) -> String {
    let j = host.invokeMethod("candidates", withArguments: [latin, "", 3])?.toString() ?? "[]"
    let arr = (try? JSONSerialization.jsonObject(with: Data(j.utf8)) as? [[String: Any]]) ?? []
    return (arr.first?["text"] as? String) ?? ""
}
let before = top("sakhte")
for _ in 0..<3 { host.invokeMethod("learn", withArguments: ["sakhte", before == "ساخته" ? "سخته" : "ساخته"]) }
let learned = top("sakhte")
let saved = host.invokeMethod("exportUserData", withArguments: [])?.toString() ?? "[]"
host.invokeMethod("importUserData", withArguments: ["[]"])
let cleared = top("sakhte")
host.invokeMethod("importUserData", withArguments: [saved])
let restored = top("sakhte")
host.invokeMethod("setUserAliases", withArguments: ["mn\tمحمد نجفی"])
let alias = top("mn")
host.invokeMethod("setOptions", withArguments: ["{\"zwnj\":\"auto\"}"])
var api = 0
func check(_ cond: Bool, _ what: String) { print(cond ? "PASS" : "FAIL", what); if !cond { api += 1 } }
check(learned != before, "learn(): a repeated choice is promoted (\(before) -> \(learned))")
check(cleared == before, "importUserData([]) forgets it again")
check(restored == learned && saved.count > 2, "exportUserData()/importUserData() round trip")
check(alias == "محمد نجفی", "setUserAliases(): user shortcut ranks first")
check(jsErrors == 0, "no JavaScript exceptions")

var ru = rusage(); getrusage(RUSAGE_SELF, &ru)
print(String(format: "peak resident memory of this process: %.0f MB", Double(ru.ru_maxrss) / 1_048_576))
exit(bad == 0 && api == 0 && total > 0 ? 0 : 1)
