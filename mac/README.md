# Finglish for Mac — the keyboard

A real macOS keyboard (input method). Install it from a disk image (drag and drop, below), add it once under System Settings → Keyboard → Input Sources; then, in **any** app, switch to it,
type Latin letters (`salam`) and a drop-down of Persian words appears under the cursor. Press a number to pick, Space for the first.
It uses the same engine, lexicon and rules as the website (`engine/dist/`), runs fully offline, and needs macOS 26 or newer (Apple silicon and Intel).

## Install — for users: a disk image
`npm run mac:dmg` (or `mac/make_dmg.sh`) builds **`mac/dist/Finglish-1.0.0.dmg`** (3 MB, universal Apple silicon + Intel, macOS 26+) and, next to it,
**`mac/dist/Finglish Settings.app`** — the same app, ready to copy into Applications to try it. The image holds exactly two things — the app and an *Applications* shortcut (drag and drop); nothing else, no read-me file.
No package, no installer, no third-party tool — just `hdiutil`. The script checks the finished image itself (verify, mount, structure, signatures, both architectures, app and keyboard from the same build).

1. Open the image, drag **Finglish Settings** onto **Applications**.
2. Open it. **The first launch is the installation**: the keyboard travels *inside* the app (`Contents/Resources/Keyboard/Finglish.bundle`); the app copies it to
   `~/Library/Input Methods/Finglish.app` (your own folder — no password) and registers it with macOS. Every later launch is only a check; a newer app dropped into Applications updates the keyboard the same way.
3. **One step stays with the user — macOS does not let an app add a new keyboard for them** (measured, see below). **The first time only**, the window opens with a **four-slide guide in Persian, lying on top of the settings (a sheet)**: a screenshot of the real System Settings for each step with the thing to click outlined in red
   (1 *Edit* beside Input Sources · 2 the *+* · 3 *Persian* → *Finglish* → *Add* · 4 *Done* — macOS applies the change only after Done), a **Next** button and a button that opens System Settings **when the user clicks it** (the app never opens it by itself — a check in `test.sh` enforces that).
   Closing the guide in any way, or the keyboard being detected, ends the first time (`Onboarding` in `KeyboardInstaller.swift`, stored in the app's user defaults; `uninstall.sh` resets it). After that the slides never come back — not even if the user later removes the keyboard; then only the status in the settings changes (warning ↔ green tick, live, every 1.5 s), the same four steps stay there as text, and a button reopens the slides on request.
   The screenshots are in `mac/Resources/Guide/` (compressed from the originals: 2.6 MB → ~450 KB) and are copied into the app by `build.sh`; the fourth is made from the second by `mac/tools/make_step4.py` (paints the "+" ring out, outlines Done).
4. Switch to it with the Globe key / Control-Space, or the keyboard menu in the menu bar → **فینگلیش (Finglish)**, and type `salam`.

*Running it from inside the disk image does nothing* (the app says to drag it to Applications first). Remove: delete the app and the keyboard from Input Sources, or `npm run mac:uninstall`.

**Signing and notarization.** A release image is signed with a Developer ID Application certificate (hardened runtime; the keyboard carries the `allow-jit` entitlement, `Resources/Finglish.entitlements`, because it runs its engine in JavaScriptCore), sent to Apple's notary service and stapled, so a downloaded copy opens without a Gatekeeper warning (checked with `spctl` on a quarantined copy of the image, of the app inside it, and of the keyboard as the app installs it).
It is switched on by `FINGLISH_SIGN_IDENTITY` (the certificate's SHA-1 hash) and `FINGLISH_NOTARY_PROFILE` (a profile made once with `xcrun notarytool store-credentials`), set in the environment or in the untracked `mac/signing.local.env`; nothing secret is in the repository. Without them the build is signed ad hoc, which is fine for development (a downloaded ad-hoc build would need Privacy & Security → Open Anyway).

### Releasing — what the website's download button serves
`npm run mac:release` (= `mac/make_dmg.sh --publish`) builds the image as above, then copies it to **`../downloads/Finglish.dmg`** (the one file the website links to; older images there are removed) and writes the version into the website's download dialog
(`index.html`: the visible version, next to the `download="Finglish.dmg"` file name). The version comes from `VERSION` in `build.sh`; `package.json` must carry the same number — `npm test` (`tests/site.test.js`) fails when the image, the link or the versions disagree.
The AGPL-3.0 text (`../LICENSE`) is copied into the app (`Contents/Resources/LICENSE`) and the image build fails without it; the settings window ends with the same centred line as the website: «© ۲۰۲۶ مهراس حجت · مجوز AGPL-3.0».
The screenshots the guide was made from are kept in `tools/guide-sources/` (`Originals/`, `Edited/`).

### Why the user adds the keyboard themselves — and what is still open (measured 2026-10-11, macOS 26/27, this Mac)
* `TISRegisterInputSource` works — the keyboard then appears in the **+** list of System Settings.
* `TISEnableInputSource` (the documented “add it to the user's list”) returns **success and adds nothing** — from a command line and from a normally launched app; `TISSelectInputSource` then answers −50 (“not enabled”). **It also makes macOS open System Settings by itself** (registering alone opens nothing) — that was the unwanted pop-up users saw on launch, and very likely what opened Settings on the very first install. The app therefore **never calls it** (only `TISRegisterInputSource`); `test.sh` fails if it ever does.
* **Where macOS records a keyboard the user added** (read from this Mac after a real *Add* and again after a real *remove*): `com.apple.inputsources` → `AppleEnabledThirdPartyInputSources` — two entries, the **keyboard** `{Bundle ID, InputSourceKind = "Keyboard Input Method"}` and its **mode** `{Bundle ID, Input Mode, InputSourceKind = "Input Mode"}`. **Removing the keyboard deletes only the keyboard entry; the mode entry stays behind**, so only the keyboard entry means “added”. Apple's own layouts stay in `com.apple.HIToolbox` → `AppleEnabledInputSources`.
* **Still open:** whether an app may write that third-party list itself (it would be an undocumented preference; macOS might also ignore it until a log-out). An earlier experiment that wrote into the *HIToolbox* list was ignored, but that was the wrong preference, so it proves nothing. Not tried yet because it means removing the keyboard from the user's list to test.
* **Three bugs of ours this exposed (all fixed):** (1) TIS reports `kTISPropertyInputSourceIsEnabled` as *true* for our keyboard mode even when it is **not** in the list — an earlier version trusted it, took its “Already added” shortcut and never tried to add. (2) After that, “in the list” was read from the HIToolbox list only, which never changes for a third-party keyboard, so a keyboard the user had really added was **never detected** (and the guide kept reappearing). (3) The fix for that accepted *any* entry of ours, so after the user **removed** the keyboard the leftover mode entry made a removed keyboard look added. Detection now requires the keyboard entry (and falls back to the HIToolbox list), with unit tests built from the entries macOS itself wrote — added, removed, nothing. The window re-checks every 1.5 s **in both directions**: green when the keyboard appears, back to the warning and the guide when it is taken out.
The app only registers the keyboard; the user's own *Add* + *Done* in System Settings is what adds it.

## Install — for developers
```bash
npm run mac:install          # or: mac/install.sh
```
Builds if needed (about a minute the first time), puts the app in `/Applications` (`~/Applications` if that is not writable), and runs `FinglishSettings --install` — the same code the first launch runs, without a window.
It prints the one manual step and does not open System Settings. Updating later (after tuning the engine): run it again — no log-out, the new version starts the next time you switch to the keyboard.
Remove: `npm run mac:uninstall` (add `-- --purge` to also delete settings and learned choices). Headless modes of the app: `--install`, `--status`, `--register`, `--unregister`.

## Using it
| key | does |
|---|---|
| letters | start a word; the best Persian candidate is shown underlined in the text, the list drops down |
| `1`–`9` | pick that Persian word (+ a space) |
| `0` | keep the **English exactly as typed** (the pinned last row, capitals kept) |
| Space / Enter | commit the highlighted word (+ a space) |
| ↓ ↑ (Tab, ← →) | move the highlight · PgDn / PgUp: next / previous page |
| Esc | cancel the word · Backspace edits it |
| `? . , ! @ - /` … | do not end the word. After the letters they stay on the Persian word (`salam?` → **سلام؟**); letters after a sign (`me@x.com`) keep it as typed. Space ends it; `0` = English as typed (experiment, can be switched off; the list of signs is editable in Settings) |
| `, ; ?` and digits | become `، ؛ ؟` and ۰–۹ when not in the middle of a word |
| **⇧Space** | half-space (نیم‌فاصله), as on a Persian keyboard: commits the word *without* a space, then types the half-space; with nothing typed it just types one; inside an e-mail/link it is a plain space |
Click a row to pick it with the mouse. Undo (⌘Z) is the app's own.

## Settings
Open **Finglish Settings** (in the **Applications** folder — or `~/Applications` if your account cannot write to `/Applications`; shows no Dock icon, quits when you close it), or from the keyboard's own menu: the keyboard menu in the menu bar → **تنظیمات فینگلیش**. The main switches are also directly in that menu.
The window and the keyboard menu are in Persian (right-to-left); `mac/test.sh` fails if an English word creeps back in. Words per page, preview, English row, auto-space, the signs experiment, Persian digits/punctuation, half-space (one checkbox), context, learning,
and how long the engine stays in memory. Changes reach the running keyboard immediately.
The last section of the window, **درباره** (About), is deliberately minimal: the app icon, name, version, two sentences — what it does and that it all runs on this Mac (the Mac apps contain no network code and link no network framework; checked) — and three links: «سازنده: مهراس حجت» ([mehrashojjat.com](https://mehrashojjat.com)), «وب‌سایت» ([finglish.mehrashojjat.com](https://finglish.mehrashojjat.com)) and «کد برنامه (متن‌باز)» ([the GitHub repository](https://github.com/mehrashojjat/Finglish), where the AGPL source of this exact app lives; the same address is in the app's `NSHumanReadableCopyright`). A small grey note credits the word lists' CC BY-SA 4.0 data (Persian Wikipedia, Wiktionary, subtitle word counts) and links to the website's «داده‌ها و منابع». Source: `Sources/Settings/AboutInfo.swift`.
**There is no Persian on/off switch and no shortcut for one** (an earlier Option+Shift+T was removed on request: it belongs to other apps and cannot be a global shortcut). To type English, switch to another keyboard (Globe key / Control-Space) — or press `0` to keep one word as typed. An old `settings.json` that still contains `"enabled"` is read fine and the key ignored; `test.sh` fails if such a shortcut returns.

### Can the settings live in System Settings → Keyboard → Input Sources? (researched 2026-10-11 — answer: no documented way)
The request was to show a settings entry in the pane that macOS draws for our keyboard. What the sources say:
* Apple's help text for that pane: *“Click an input source to see its **keyboard layout** and set **additional options**”* (the example given: for Hebrew, options for bidirectional text and keyboard shortcuts) — i.e. system-drawn content per source ([Apple: Input Sources](https://support.apple.com/guide/mac-help/mchl84525d76)).
* Apple's input-method technote lists **every** Info.plist key an input method can declare (`ComponentInputModeDict`, `tsInputModeListKey`, `tsVisibleInputModeOrderedArrayKey`, per-mode icon / script / shortcut keys, `ComponentInvisibleInSystemUI`…): **none** adds a control or a settings link to System Settings ([TN2128](https://developer.apple.com/library/archive/technotes/tn2005/tn2128.html)).
* Checked on this Mac: Apple's own input methods (`/System/Library/Input Methods/*`: Japanese, Korean, Chinese, Transliteration…) declare **no** preference-related key either, and neither does the open-source Mozc Japanese keyboard.
* The documented settings entry for an input method is **InputMethodKit's `showPreferences:`**: put an item whose action is `showPreferences:` in the keyboard's menu and the system calls it when the user picks it ([IMKInputController.h](https://jenkins.heirloomcomputing.com/downloads/MacOSX10.8.sdk/System/Library/Frameworks/InputMethodKit.framework/Headers/IMKInputController.h); open-source keyboards such as McBopomofo/vChewing do exactly this). **That is what the menu item “تنظیمات فینگلیش” is** — it opens this settings window.
* **Primary evidence — the code that draws that pane, read on the user's Mac** (`/System/Library/ExtensionKit/Extensions/KeyboardSettings.appex`, `strings`): the headline “Installed Input Source” is documented in the code as *“Headline for warning texts about third-party input methods”* and the body as *“a warning string for installed third party methods”* — a fixed notice, nothing is configurable. The per-language options of Apple's own sources (*Bidirectional Text*, *Use natural selection*, *Enable keyboard shortcuts*, *Edit Arabic short date*, and special cases for Apple's Chinese input methods by bundle id) are **written into System Settings itself**, keyed by Apple's own sources — they are not supplied by the input methods. The only things it reads from a third-party keyboard's Info.plist are `CFBundleDisplayName`, `CFBundleName`, `ComponentInputModeDict`/`tsInputModeListKey` (the modes) and the help-book keys `CFBundleHelpBookName` / `CFAppleHelpAnchor`. **No setting, button or link of ours can be shown there.** The one unexplored corner is a Help book (a possible “?” link), which is not a settings control, cannot be verified without seeing the pane, and rests on legacy Apple Help — not done.
* **Confirmed by a screenshot from the user's Mac** (Keyboard → Text Input → Edit, Finglish selected): the right-hand pane holds only macOS's own security notice for any third-party keyboard — *“Installed Input Source — The developer can access anything you type with this input source. This could include sensitive information such as your credit card number or home address.”* — and nothing an app can fill. So there is nothing to add there; the keyboard's menu in the menu bar (next to the other keyboards) is where the settings entry lives.
* **The one line we do control there:** under our keyboard's name in that list macOS prints the keyboard bundle's *display name* (it used to read “Finglish Keyboard”). It now reads **“Settings: open the Finglish Settings app”** (Persian: «تنظیمات: برنامهٔ Finglish Settings را باز کنید»; `Resources/*.lproj/InfoPlist.strings`). It is text, not a button — macOS offers no way to put a button in that pane.
* **The keyboard's menu in the menu bar** is drawn by macOS in *another process*, so it cannot call back an arbitrary object of ours — it can only send each item's action NAME to the input controller. An earlier version pointed the switches at a helper object, and clicking them did nothing. Now every item has no target and each action is an `@objc` method of `FinglishInputController`; `test.sh` compiles the controller and fails if any menu action is not a method of it, if two switches share one, or if a title is not Persian.


## Energy and memory (why it costs nothing when you are not typing)
* Nothing runs, polls or touches the network. The keyboard process is idle between key presses (measured: **33 MB, 0.0 % CPU** with the engine unloaded).
* The engine (≈ 100 MB, 2 s to load) is loaded **in the background when you switch to the keyboard**; you can type meanwhile (Latin shows, Persian appears when ready).
* It is **freed again** a few minutes after you switch away (setting; default 5) and immediately under memory pressure.
* A key press costs about 15 ms of CPU in JavaScriptCore.

## How it is built (for later changes)
```
mac/Sources/Shared/Settings.swift    settings + the files they live in (~/Library/Application Support/Finglish Keyboard/)
mac/Sources/IME/Session.swift        ALL typing rules (Swift twin of assets/js/ime.js) — plain Swift, tested without macOS
mac/Sources/IME/EngineHost.swift     the engine in JavaScriptCore: lazy load, unload, learning saved to disk
mac/Sources/IME/FinglishInputController.swift, KeyTranslator.swift, CandidatePanel.swift, AppState.swift, main.swift   macOS glue
mac/Sources/Settings/                the settings app (SwiftUI) + first-launch install (Setup, KeyboardInstaller) + the keyboard registrar (Carbon TIS)
mac/make_dmg.sh · install.sh · uninstall.sh   the disk image · developer install · removal
mac/Resources/                       Info.plists (structure copied from Apple's own TamilIM), names, icon script in mac/tools/
                                     (the icons draw assets/img/logo.svg: Vazirmatn Bold ف outlined by tools/make_logo.swift — same file as the website's logo)
engine/dist/                         the SAME engine package as the website — copied into the keyboard's Resources at build time
```
Tuning the algorithm or the data: edit `engine/` or `data/`, then `npm run mac:install` (it re-bundles the engine and rebuilds). One engine, two consumers.
Changing *typing behaviour* (keys, window) is done in `Session.swift` here **and** `assets/js/ime.js` for the website.

## What was tested, and what was not
Tested without installing anything (`npm run mac:test`, 106 checks): all typing rules against a fake text field (mirrors the website's browser tests), key-code translation with
synthetic key events, the real engine loading in the background / unloading / reloading with learned choices kept, plist structure compared with Apple's own input method,
the built apps' signatures, the keyboard process starting and idling at 0 % CPU, and the candidate window and settings form rendered off-screen to images.
**Not tested: the live experience inside a real app** — that needs the keyboard installed and selected, so please try it and tell me what you see
(typing into Notes/Safari, where the list appears, the first-run keyboard-list step). Diagnostics: create the empty file `~/Library/Application Support/Finglish Keyboard/debug` and the keyboard writes every key it receives and decides to `~/Library/Logs/Finglish/keyboard.log` (it records what you type — delete the file and the log afterwards).
