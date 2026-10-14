import Foundation
import JavaScriptCore

extension Notification.Name {
    static let finglishEngineReady = Notification.Name("FinglishEngineReady")
}

final class EngineHost: EngineProviding {
    static let shared = EngineHost()

    private let queue = DispatchQueue(label: "com.finglish.ios.engine", qos: .userInitiated)
    private let lock = NSLock()
    private var context: JSContext?
    private var host: JSValue?
    private var loading = false
    private var ready = false
    private var learnedGeneration = 0

    var isReady: Bool {
        lock.lock(); defer { lock.unlock() }
        return ready
    }

    func start() {
        lock.lock()
        guard !ready, !loading else { lock.unlock(); return }
        loading = true
        lock.unlock()

        queue.async { [weak self] in
            guard let self else { return }
            let read: (String) -> String = { name in
                // Xcode copies the four engine resources into the extension bundle's resource root.
                guard let url = Bundle.main.url(forResource: name, withExtension: nil) else { return "" }
                return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
            }

            guard let js = JSContext() else {
                self.finishLoading()
                return
            }
            js.exceptionHandler = { _, exception in
                NSLog("Finglish iOS engine error: %@", exception?.toString() ?? "unknown")
            }
            js.evaluateScript(read("farsi-ime-engine.js"))
            guard let host = js.objectForKeyedSubscript("FarsiIME")?.objectForKeyedSubscript("host"), !host.isUndefined else {
                NSLog("Finglish iOS: engine resource is missing")
                self.finishLoading()
                return
            }

            let settings = SharedStore.loadSettings()
            // Keyboard extensions have a much smaller memory budget than the containing app.
            // Keep the compact keyboard profile free of the heavier macOS/web
            // OOV and morphology models, but always reserve the final visible
            // row for an exact Persian letter-by-letter spelling when needed.
            let options = "{\"zwnj\":\"\(settings.zwnj)\",\"oov\":false,\"morph\":false,\"ctxWeight\":0,\"literalFallback\":true}"
            _ = host.invokeMethod("init", withArguments: [read("lexicon.tsv"), "", read("aliases.tsv"), options])
            _ = host.invokeMethod("importUserData", withArguments: [SharedStore.loadLearned()])
            JSGarbageCollect(js.jsGlobalContextRef)

            self.lock.lock()
            self.context = js
            self.host = host
            self.learnedGeneration = SharedStore.learnedGeneration
            self.ready = true
            self.loading = false
            self.lock.unlock()
            DispatchQueue.main.async { NotificationCenter.default.post(name: .finglishEngineReady, object: nil) }
        }
    }

    func candidates(latin: String, prev: String, max: Int) -> [Candidate] {
        guard isReady else { return [] }
        return queue.sync {
            guard let host else { return [] }
            syncLearnedIfNeeded(host)
            let json = host.invokeMethod("candidates", withArguments: [latin, prev, min(3, max)])?.toString() ?? "[]"
            guard let data = json.data(using: .utf8), let objects = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
            return objects.compactMap { object in
                guard let text = object["text"] as? String else { return nil }
                let score = (object["score"] as? NSNumber)?.doubleValue ?? 0
                return Candidate(text: text, kind: object["kind"] as? String ?? "lex", score: score)
            }
        }
    }

    func learn(latin: String, persian: String) {
        guard isReady else { return }
        queue.async { [weak self] in
            guard let self, let host = self.host else { return }
            _ = host.invokeMethod("learn", withArguments: [latin, persian])
            // Keyboard extensions can be torn down as soon as the keyboard
            // closes. A delayed write loses the choice before the next launch,
            // so persist the small learned-data payload before returning.
            self.saveLearnedNow()
        }
    }

    func applyUserSettings(_ settings: Settings) {
        guard isReady else { return }
        queue.async { [weak self] in
            guard let self, let host = self.host else { return }
            _ = host.invokeMethod("setOptions", withArguments: ["{\"zwnj\":\"\(settings.zwnj)\"}"])
        }
    }

    private func finishLoading() {
        lock.lock(); loading = false; lock.unlock()
    }

    private func syncLearnedIfNeeded(_ host: JSValue) {
        let generation = SharedStore.learnedGeneration
        guard generation != learnedGeneration else { return }
        _ = host.invokeMethod("importUserData", withArguments: [SharedStore.loadLearned()])
        learnedGeneration = generation
    }

    private func saveLearnedNow() {
        guard let host, let json = host.invokeMethod("exportUserData", withArguments: [])?.toString() else { return }
        if json.count > 2 { SharedStore.saveLearned(json) }
    }
}
