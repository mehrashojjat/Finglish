# Architecture

## 1. Overview

```
 the engine (the one thing everything shares)          what uses it
 ─────────────────────────────────────────────         ─────────────────────────────────────────────
 engine/src/   noisy-channel transliteration (JS)       index.html + assets/   the website (offline, static)
 engine/dist/  one-file package + word lists            mac/                   the macOS keyboard (JavaScriptCore) + settings app
 data/         aliases, lexicon, bigrams                downloads/             the Mac disk image the website offers
```

The product makes **no network request of any kind** (§8). Everything it knows ships inside it.

## 2. Repository map

The repository root is the website: a static host serves `index.html`, `assets/` and `downloads/` as they are.

```
Farsi Transliteration/
├─ index.html                 the website, Persian (right-to-left): editor, explanation, examples, keys help, settings, FAQ, About, download dialog, footer
├─ en/index.html              the same tool in English (own title/H1/text/FAQ; shares assets/ and the scripts)
├─ robots.txt · llms.txt · sitemap.xml · 404.html · favicon.ico · apple-touch-icon.png    search-engine and AI-assistant files (docs/SEO.md); the address-dependent ones are written by tools/seo.js
├─ assets/
│  ├─ css/ js/ img/ fonts/    style.css · ime.js (typing controller) · app.js (wiring) · download.js (dialog) · logo.svg · og.png / icon-512.png (share preview, structured-data logo) · Vazirmatn (woff2 + OFL.txt + the TTF the logo is outlined from)
│  ├─ vendor/                 farsi-ime-engine.js   — GENERATED copy of engine/dist
│  └─ data/                   lexicon.js · bigrams.js · aliases.js — GENERATED, the same word lists wrapped as scripts (so the page also works from file://)
├─ downloads/Finglish.dmg     the Mac disk image the download button serves (npm run mac:release)
├─ engine/
│  ├─ src/                    alphabet · normalize · skeleton · lexicon · channel · charlm · oov · morph · letters · engine · host · index
│  └─ dist/                   THE HOST PACKAGE: farsi-ime-engine.js (global `FarsiIME`, incl. the string API `FarsiIME.host`) + lexicon/bigrams/aliases .tsv + VERSION.json
├─ data/
│  ├─ aliases.tsv             hand-written shortcuts (English spellings etc.)
│  ├─ raw/                    downloaded corpora (large; not in git)
│  └─ build/                  lexicon.tsv, bigrams.tsv (in git) and the intermediate counts (not in git)
├─ mac/                       the macOS keyboard + settings app: Sources/ Resources/ Tests/ tools/ and the build, test, DMG, install scripts (see mac/README.md)
├─ docs/                      ARCHITECTURE (this file) · ENGINE · DATA_SOURCES · RESULTS (generated) · TUNING (+ tuning/ raw logs) · SEO · screenshots/
├─ tools/                     count_*.py · build_*.py · hints.py · tune.js · bundle.js · serve.js · seo.js · ime-cli.js · make_*.{py,js,swift}
├─ tests/
│  ├─ gold/                   benchmark sets (natural_1, natural_2_heldout, inflected_3, sentences_4, unsupported_aliases)
│  ├─ engine.test.js          engine unit/regression tests          site.test.js   the repository as a publishable site (links, download, licence)
│  ├─ eval.js · eval_context.js · report.js   accuracy tools
│  ├─ golden/parity_vectors.jsonl   frozen outputs (through the host API) for verifying every runtime
│  ├─ swift_host/main.swift   a Swift program embedding JavaScriptCore: replays the vectors against engine/dist (npm run proof:mac)
│  ├─ audit_offline.js · no_network_preload.js · no_network_selftest.js   static + network-blocked proofs of "offline"
│  └─ e2e/                    puppeteer-core browser tests (smoke.js, site.js, offline_proof.js, parity_browser.js)
├─ LICENSE                    GNU AGPL-3.0 (official text, unmodified)
└─ README.md · package.json · .gitignore · .gitattributes · .nojekyll
```

## 3. Build pipeline (data → app)

```
OPUS subtitles ──count_opus.py uni──► opus_unigrams.tsv ─┐
Wikipedia dump ──count_wiki.py──────► wiki_unigrams.tsv ─┤
Wikipedia titles ────────────────────────────────────────┤──build_lexicon.py──► lexicon.tsv ──┐   (+ hints.py ◄── Wiktionary JSONL)
Wiktionary lemmas ───────────────────────────────────────┘                                    │
OPUS subtitles ──count_opus.py bi──► opus_bigrams.tsv ──build_bigrams.py──► bigrams.tsv ──────┤
data/aliases.tsv ─────────────────────────────────────────────────────────────────────────────┤
engine/src/*.js ──────────────────────────────────────────────────────────────────────────────┴──bundle.js──► engine/dist/ + assets/{vendor,data}/
```

## 4. Runtime flow of one keystroke (website)

```
keydown (textarea) ─► IMEController (assets/js/ime.js)
      │ letter → buf += key           Space/Enter/1-9 → commit            Esc → cancel
      ▼
  host.provider(buf, textBeforeCaret)                              assets/js/app.js
      └─ engine.candidates(buf, {max, prev}) ─► [{text, kind, score}]            (sync, ≈2 ms)       engine/src/engine.js
      ▼
  apply(list): preview the first candidate inline (selected text), render the popup next to the caret: Persian rows 1…N + the typed Latin pinned as the last row (key 0)
      ▼
  commit → textarea.setRangeText(...) + 'input' event;  engine.learn(buf, text) → localStorage
```

Engine API (all a native host needs):

```js
const eng = FarsiIME.Engine.fromTSV(lexiconTsv, { zwnj: 'off' });   // ~0.5 s once
eng.setAliases(aliasesTsv);  eng.setBigrams(bigramsTsv);            // optional
eng.setUserAliases('mn\tمحمد نجفی');                                  // optional; the engine supports it, no app UI uses it (removed 2026-10-11)
eng.candidates('salam', { max: 18, prev: 'من' })                    // → [{text, score, cost, logp, kind: 'lex'|'oov'|'morph'|'alias'}]
eng.learn('salam', 'سلام'); eng.exportUserData(); eng.importUserData(entries);
```

## 5. Decisions worth remembering

| decision | why |
|---|---|
| Own engine built from open data | no service to depend on, nothing to send anywhere, and the numbers can be tuned and explained (benchmarks in `RESULTS.md`) |
| Noisy channel + frequency prior, not a neural model | explainable, tunable by hand, 2 ms, 100 MB, a few hundred lines — and trivially portable (JavaScriptCore / Swift / Rust) |
| Skeleton retrieval | makes candidate generation a hash lookup whatever the vowels typed |
| Plain `<textarea>` + selected provisional text (no contenteditable) | robust, copy/paste/undo-friendly; the same state machine maps 1:1 onto macOS *marked text* |
| UMD-free single-file bundle | loads from `file://`, in JavaScriptCore, in a WebView, with no module system |
| `onlySpaceCommits` experiment flag (default in `assets/js/app.js`, checkbox in Settings) | signs do not end a word: after the letters they stay on the Persian word (`salam?` → سلام؟), letters after a sign make it literal text (e-mails, links) and skip the engine entirely. Easy to switch off: untick it or flip the default |
| A second tuning round rejected | it lowered held-out accuracy (over-fitting); independent sets are the arbiter |
| Hints only for the 4% of forms Wiktionary covers | the frequent ones; adding noisy guesses for the rest would bias the ranking |

## 6. Path to a macOS app (and later Windows)

The website is the reference implementation of behaviour; the engine is the portable part.

**Route A — fastest: Swift input-method app hosting the JS bundle** (identical behaviour, no port)
1. New Xcode project → *InputMethodKit* app (`IMKServer`, `IMKInputController` subclass). `Info.plist`: `InputMethodConnectionName`, `tsInputMethodIconFileKey`, an `ComponentInputModeDict` with a Persian-Finglish mode, `LSUIElement`. Installed to `~/Library/Input Methods/` (log out/in once); signing/notarisation for distribution.
2. Embed `JSContext` (JavaScriptCore); evaluate `engine/dist/farsi-ime-engine.js`; read `lexicon.tsv`, `bigrams.tsv`, `aliases.tsv` as strings and call `FarsiIME.host.init(...)`. Keep one context alive for the process. **This exact flow is implemented and tested in `tests/swift_host/main.swift`** (a Swift program: `npm run proof:mac`) — copy it as the engine layer of the app.
3. Map the controller: `handle(_ event:client:)` / `inputText(_:client:)` → the same key rules as `assets/js/ime.js` (letters append, Space/Enter/digits commit, ↑/↓ move, Esc cancel, Backspace edit);
   `client.setMarkedText` = the inline preview; `client.insertText` = commit; candidates via `IMKCandidates` (system panel, numbered, paged) or a custom `NSPanel` that mirrors our popup.
4. Persistence: `engine.exportUserData()` → `~/Library/Application Support/<App>/learned.json`; user aliases as a text file.
5. Cost, **measured** in macOS JavaScriptCore from Swift (this Mac, `npm run proof:mac`): start-up 1.9 s (lexicon parse + char-LM training; do it on a background thread at launch), then **median 15 ms, p95 40 ms, worst 92 ms per keystroke** (V8 in Node: 2.3 / 6.7 / 18 ms), ≈ 240 MB peak. Fine for typing; not free. I could not tell JIT from interpreter-only here (`JSC_useJIT=false` gave the same numbers); a signed/hardened app may need the JIT entitlement — **not verified in a signed app**. If it ever feels heavy: a binary lexicon, a smaller 118k lexicon (same benchmark accuracy), or Route B.

**Route B — native port** (smaller, faster start, no JS): reimplement `engine/src` in Swift (≈ 1,000 lines) and **prove parity with `tests/golden/parity_vectors.jsonl`**
(texts & kinds exact, scores within 0.01). Use a binary/mmap lexicon (the 118k-word build is 2.5× smaller with the same benchmark accuracy).

**Route C — shared Rust core** with Swift (macOS) and TSF/C++ (Windows) front-ends, same parity file as the contract.

Whatever the route, the **website stays the behavioural spec**: `assets/js/ime.js` documents every key rule, and `tests/e2e/smoke.js` encodes them as executable checks.

## 7. One engine, two consumers: how updates flow

```
engine/src/*.js  +  data/ (lexicon, bigrams, aliases)
          │  npm run bundle
          ▼
   engine/dist/  ← THE ARTIFACT (farsi-ime-engine.js + lexicon.tsv + bigrams.tsv + aliases.tsv + VERSION.json with sha256)
      ├─ copied as-is into assets/vendor + assets/data (website)   — byte-identical, enforced by a unit test
      └─ embedded as-is in the Mac app (JavaScriptCore host)       — verified by tests/swift_host (Swift)
          │  npm run parity  → tests/golden/parity_vectors.jsonl (941 inputs → top-5 + scores, produced through the string host API)
          ▼  npm run proof:mac  → Node, Chrome (the website's live engine) and macOS JavaScriptCore must all reproduce every vector
```

**Fine-tuning workflow** (algorithm, costs, lexicon, aliases, hints): edit `engine/src/*` or `data/…` → `npm run bundle` → `npm run proof` →
the website is updated; for the Mac app replace the five files in `engine/dist/` inside the app bundle (no Swift change unless the host API changes).
When a tuning change *intentionally* alters outputs, `npm run parity` rewrites the vector file; `git diff tests/golden/parity_vectors.jsonl` is then a readable review of exactly which words changed.

**Shared:** the algorithm, all data, learning/aliases/context logic, the string host API (`engine/src/host.js`).
**Not shared (be aware):** the *typing controller* — key rules, candidate window, Latin row, `onlySpaceCommits`, undo — lives in `assets/js/ime.js` and is tied to the DOM. A Mac input method needs the equivalent in Swift/InputMethodKit (≈ 350 lines; `ime.js`'s header and `tests/e2e/smoke.js` are its specification). Tuning *behaviour* therefore has to be done in both places. If that becomes a burden, the fix is to extract the controller's state machine into a DOM-free module in `engine/src/` that both the page and the Mac host call; it was deliberately not done now because the web version works.
Personal data (learned choices) uses the same format on both (`exportUserData()` JSON); only the storage place differs (browser `localStorage` vs a file).

## 8. Offline guarantee — what is proven and how

The website is proven to make **no network request of any kind** (`npm run proof:offline`); the one deliberate exception is the download, fetched only when its link is clicked:
1. **Static audit** (`tests/audit_offline.js`): `engine/` and the website (`index.html`, `assets/`) contain **no network API at all** (fetch, XHR, WebSocket, EventSource, sendBeacon, importScripts); the page loads nothing external (fonts bundled; the About section's links are plain links the user clicks); the page's own scripts contain no web address at all.
2. **Node with the network blocked** (`tests/no_network_preload.js`: sockets, TLS, UDP, DNS, http(s), fetch, WebSocket and child processes all throw): the engine tests, the benchmark evaluation and the parity generation pass. A self-test shows each of those routes really is blocked.
3. **Real Chrome** (`tests/e2e/offline_proof.js`): fresh profile, default settings, full feature use, (a) from disk with Chrome's network emulation set to *offline*, (b) served from localhost with every non-localhost request intercepted. Zero external requests and not even a fetch/XHR *attempt*. The download dialog is opened and closed in that run too. A **positive control** makes the test itself fire one deliberate fetch to an outside address and the same detectors must see it — proof that “zero” means something.

