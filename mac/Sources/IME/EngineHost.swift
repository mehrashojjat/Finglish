// The transliteration engine, hosted in JavaScriptCore (the system framework). This is the SAME engine/dist package the website uses.
//
// Energy / memory policy (the keyboard should cost nothing while you are not typing):
//   • nothing is loaded at process start; the engine loads (≈2 s, on a background queue) when the keyboard is switched ON
//   • while loading, typing still works (the typed Latin is shown, Persian appears as soon as the engine is ready)
//   • N minutes after the keyboard is switched away from (setting; default 5) — or on memory pressure — the engine is released
//   • no timers, no polling, no network: work happens only inside a key press
import Foundation
import JavaScriptCore

extension Notification.Name { static let engineReady = Notification.Name("FinglishEngineReady") }

final class EngineHost: EngineProviding {
    static let shared = EngineHost()

    private let queue = DispatchQueue(label: "com.finglish.engine", qos: .userInitiated)
    private let lock = NSLock()
    private var ready = false
    private var loading = false
    private var ctx: JSContext?
    private var host: JSValue?
    private var activeClients = 0
    private var unloadItem: DispatchWorkItem?
    private var saveItem: DispatchWorkItem?
    private var memoryPressure: DispatchSourceMemoryPressure?
    private(set) var loadSeconds: Double = 0

    var zwnj = "off"

    /// Where engine/dist lives: the app's Resources/engine, or $FINGLISH_DIST (tests, development).
    static var distDir: URL {
        if let o = ProcessInfo.processInfo.environment["FINGLISH_DIST"] { return URL(fileURLWithPath: o, isDirectory: true) }
        return Bundle.main.resourceURL!.appendingPathComponent("engine", isDirectory: true)
    }

    var isReady: Bool { lock.lock(); defer { lock.unlock() }; return ready }

    // MARK: lifecycle
    /// The keyboard was switched ON in some app.
    func clientActivated() {
        DispatchQueue.main.async {
            self.activeClients += 1
            self.unloadItem?.cancel(); self.unloadItem = nil
            self.ensureLoaded()
        }
    }

    /// The keyboard was switched away from. After `minutes` of nobody using it the engine is released (0 = never).
    func clientDeactivated(unloadAfterMinutes minutes: Int) {
        DispatchQueue.main.async {
            self.activeClients = max(0, self.activeClients - 1)
            guard self.activeClients == 0, minutes > 0 else { return }
            self.unloadItem?.cancel()
            let item = DispatchWorkItem { [weak self] in if self?.activeClients == 0 { self?.unload() } }
            self.unloadItem = item
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(minutes) * 60, execute: item)
        }
    }

    func ensureLoaded() {
        lock.lock()
        if ready || loading { lock.unlock(); return }
        loading = true
        lock.unlock()
        installMemoryPressureHandler()
        queue.async { [self] in
            let t0 = Date()
            let dist = EngineHost.distDir
            func read(_ f: String) -> String { (try? String(contentsOf: dist.appendingPathComponent(f), encoding: .utf8)) ?? "" }
            guard let context = JSContext() else { lock.lock(); loading = false; lock.unlock(); return }
            context.exceptionHandler = { _, e in NSLog("Finglish engine JS error: %@", e?.toString() ?? "?") }
            context.evaluateScript(read("farsi-ime-engine.js"))
            guard let h = context.objectForKeyedSubscript("FarsiIME")?.objectForKeyedSubscript("host"), !h.isUndefined else {
                NSLog("Finglish: engine bundle missing in %@", dist.path); lock.lock(); loading = false; lock.unlock(); return
            }
            let opts = "{\"zwnj\":\"\(zwnj)\"}"
            h.invokeMethod("init", withArguments: [read("lexicon.tsv"), read("bigrams.tsv"), read("aliases.tsv"), opts])
            h.invokeMethod("importUserData", withArguments: [UserFiles.loadText(UserFiles.learned)])
            JSGarbageCollect(context.jsGlobalContextRef)            // give the temporary file strings back
            lock.lock(); ctx = context; host = h; ready = true; loading = false; loadSeconds = Date().timeIntervalSince(t0); lock.unlock()
            DispatchQueue.main.async { NotificationCenter.default.post(name: .engineReady, object: nil) }
        }
    }

    func unload() {
        queue.async { [self] in
            saveLearnedNow()
            lock.lock(); ready = false; ctx = nil; host = nil; lock.unlock()
        }
    }

    private func installMemoryPressureHandler() {
        if memoryPressure != nil { return }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let src = DispatchSource.makeMemoryPressureSource(eventMask: [.warning, .critical], queue: .main)
            src.setEventHandler { [weak self] in if self?.activeClients == 0 { self?.unload() } }
            src.resume()
            self.memoryPressure = src
        }
    }

    // MARK: EngineProviding
    func candidates(latin: String, prev: String, max: Int) -> [Candidate] {
        guard isReady else { return [] }
        return queue.sync {
            guard let h = host else { return [] }
            let json = h.invokeMethod("candidates", withArguments: [latin, prev, max])?.toString() ?? "[]"
            guard let arr = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [[String: Any]] else { return [] }
            return arr.compactMap { d in
                guard let t = d["text"] as? String else { return nil }
                return Candidate(text: t, kind: (d["kind"] as? String) ?? "lex", score: (d["score"] as? Double) ?? 0)
            }
        }
    }

    func learn(latin: String, persian: String) {
        guard isReady else { return }
        queue.async { [self] in
            host?.invokeMethod("learn", withArguments: [latin, persian])
            saveItem?.cancel()
            let item = DispatchWorkItem { [weak self] in self?.saveLearnedNow() }
            saveItem = item
            queue.asyncAfter(deadline: .now() + 3, execute: item)       // one write per burst of typing
        }
    }

    /// Settings changed (half-space policy): push them into the running engine.
    func applyUserSettings(zwnj: String) {
        self.zwnj = zwnj
        guard isReady else { return }
        queue.async { [self] in
            host?.invokeMethod("setOptions", withArguments: ["{\"zwnj\":\"\(zwnj)\"}"])
        }
    }

    func forgetLearned() {
        queue.async { [self] in
            host?.invokeMethod("importUserData", withArguments: ["[]"])
            try? FileManager.default.removeItem(at: UserFiles.learned)
        }
    }

    private func saveLearnedNow() {
        guard let h = host, let json = h.invokeMethod("exportUserData", withArguments: [])?.toString() else { return }
        if json.count > 2 { UserFiles.saveText(json, to: UserFiles.learned, notify: false) }
    }
}
