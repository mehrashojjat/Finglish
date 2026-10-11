#!/bin/bash
# Compile and run the Mac keyboard's logic tests (no installation, no UI).      mac/test.sh
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
swiftc -swift-version 5 -O Sources/Shared/Settings.swift Sources/IME/Session.swift Sources/IME/EngineHost.swift Sources/IME/KeyTranslator.swift Sources/Settings/KeyboardInstaller.swift Tests/main.swift \
       -framework JavaScriptCore -framework AppKit -o build/finglish-tests
FINGLISH_DIST="$(cd .. && pwd)/engine/dist" build/finglish-tests

# The keyboard's menu: every action must exist on the input controller (compiled with the whole keyboard except its own main.swift)
mkdir -p build/mc && cp Tests/menu_check.swift build/mc/main.swift                  # top-level code must live in a file called main.swift
swiftc -swift-version 5 -O Sources/Shared/*.swift $(ls Sources/IME/*.swift | grep -v '/main.swift') build/mc/main.swift -o build/menu-check \
       -framework Cocoa -framework InputMethodKit -framework JavaScriptCore 2>&1 | grep -E "error" || true
build/menu-check

# Everything the user reads in the settings window and in the keyboard menu must be Persian: no Latin word of 3+ letters in those strings
# (key names, the signs example and the macOS names that must match what is on screen are the only exceptions).
python3 -I - <<'PY'
import re, sys
allowed = {"Globe", "Control", "Space", "Enter", "salam", "example", "com", "Keyboard", "System", "Settings", "Input", "Sources", "Finglish", "app", "Library", "Methods", "install", "macOS", "mac", "Edit", "Text", "Persian", "Applications", "Done", "Add"}
bad = []
for path, pattern in (("Sources/Settings/SettingsView.swift", r'(?:Toggle|Text|Section|Picker|Button)\("((?:[^"\\]|\\.)*)"'),
                      ("Sources/IME/FinglishInputController.swift", r'(?:Toggle\(title: |NSMenuItem\(title: )"((?:[^"\\]|\\.)*)"'),
                      ("Sources/Settings/InputSourceRegistrar.swift", r'fa: "((?:[^"\\]|\\.)*)"|return "((?:[^"\\]|\\.)*)"|manualFa = "((?:[^"\\]|\\.)*)"'),
                      ("Sources/Settings/Setup.swift", r'fa: "((?:[^"\\]|\\.)*)"'),
                      ("Sources/Settings/GuideView.swift", r'"((?:[^"\\]|\\.)*)"'),
                      ("Sources/Settings/AboutInfo.swift", r'"((?:[^"\\]|\\.)*)"')):
    src = open(path, encoding="utf-8").read()
    for m in re.finditer(pattern, src):
        text = next(g for g in m.groups() if g is not None)
        text = re.sub(r"\\\(.*?\)", "", text)                  # Swift interpolations \(name) are code, not words
        if (path.endswith("Registrar.swift") or path.endswith("Setup.swift") or path.endswith("GuideView.swift") or path.endswith("AboutInfo.swift")) and not re.search(r"[\u0600-\u06FF]", text): continue      # the English twin kept for the terminal
        if re.search(r"(?<![۰-۹])۰(?![۰-۹])", text): bad.append((path.split("/")[-1], "a lone ۰ (looks like a dot: write صفر)", text[:50]))
        if "تأیید" in text or "تمام کند" in text: bad.append((path.split("/")[-1], "old wording (use تایید کند)", text[:50]))
        for w in re.findall(r"[A-Za-z]{3,}", text):
            if w not in allowed: bad.append((path.split("/")[-1], w, text[:50]))
print("PASS no English left in the settings window and the keyboard menu" if not bad else "FAIL English words left: %s" % bad)
sys.exit(1 if bad else 0)
PY

# Two promises to the user, kept by a check so they cannot slip back in (each was reported twice):
#  1. the app never asks macOS to "enable" the keyboard — that call adds nothing and makes macOS open System Settings by itself;
#  2. the app opens System Settings only from one place: the button the user clicks.
if grep -rn "TISEnableInputSource(" Sources | grep -v ':[0-9]*:[[:space:]]*//'; then echo "FAIL the app calls TISEnableInputSource (it makes macOS open System Settings)"; exit 1; fi
OPENS=$(grep -rn "NSWorkspace.shared.open" Sources | grep -v ':[0-9]*:[[:space:]]*//' | wc -l | tr -d ' ')
if [ "$OPENS" != "1" ]; then echo "FAIL the app opens something with NSWorkspace in $OPENS places (only the 'open Keyboard settings' button may)"; exit 1; fi
if grep -rn "⌥⇧T\|Option+Shift\|keyCode == 17" Sources | grep -v ':[0-9]*:[[:space:]]*//'; then echo "FAIL a Persian on/off shortcut is back in the Mac app (users do not want one: Option+Shift+T belongs to other apps)"; exit 1; fi
echo "PASS the app never enables the keyboard itself, opens System Settings only from its button, and has no on/off shortcut"

# --preview : also render the candidate window and the settings form to build/preview/*.png (off-screen; nothing is shown)
if [ "${1:-}" = "--preview" ]; then
  if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app ]; then export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer; fi
  mkdir -p build/pm && cp tools/render_preview.swift build/pm/main.swift      # top-level code must live in a file called main.swift
  swiftc -swift-version 5 -O Sources/Shared/Settings.swift Sources/Settings/SettingsView.swift Sources/Settings/InputSourceRegistrar.swift Sources/Settings/Setup.swift Sources/Settings/KeyboardInstaller.swift Sources/Settings/GuideView.swift Sources/Settings/AboutInfo.swift \
         Sources/IME/Session.swift Sources/IME/CandidatePanel.swift build/pm/main.swift -o build/render-preview \
         -framework AppKit -framework SwiftUI -framework Carbon 2>&1 | grep -E "error" || true
  FINGLISH_GUIDE_DIR="$PWD/Resources/Guide" FINGLISH_ICON="$PWD/build/icons/AppIcon.icns" build/render-preview build/preview
fi
