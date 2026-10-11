#!/bin/bash
# Build both apps from the command line: no Xcode project, no signing account, nothing to click.      mac/build.sh
#   build/app/Finglish.app            the keyboard (input method) — for tests; users never handle it
#   build/app/Finglish Settings.app   THE app users install: the settings window (no Dock icon) with the keyboard inside it
#                                     (Contents/Resources/Keyboard/Finglish.bundle); its first launch installs and adds the keyboard
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
VERSION="1.0.0"; BUILD="$(date +%Y%m%d%H%M)"
TARGET_OS="26.0"                                   # minimum macOS version

# SwiftUI's macros ship with full Xcode (the Command Line Tools alone cannot compile the settings window). Using it needs no GUI.
if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app ]; then export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer; fi

echo "▸ engine package"
if command -v node >/dev/null 2>&1; then (cd "$ROOT" && node tools/bundle.js >/dev/null); fi
DIST="$ROOT/engine/dist"
for f in farsi-ime-engine.js lexicon.tsv bigrams.tsv aliases.tsv; do [ -s "$DIST/$f" ] || { echo "missing $DIST/$f — run: npm run bundle (needs Node)"; exit 1; }; done

rm -rf build/app build/tmp build/icons; mkdir -p build/app build/tmp

echo "▸ icons"
swift tools/make_icons.swift build/icons >/dev/null
iconutil -c icns build/icons/AppIcon.iconset -o build/icons/AppIcon.icns

ARCHS="arm64 x86_64"
compile() {   # compile <name> <extra swiftc flags…> -- <sources…>
  local name="$1"; shift; local flags=(); while [ "$1" != "--" ]; do flags+=("$1"); shift; done; shift
  local made=()
  for a in $ARCHS; do
    if swiftc -swift-version 5 -O -target "$a-apple-macos$TARGET_OS" "${flags[@]}" "$@" -o "build/tmp/$name-$a" 2>build/tmp/$name-$a.log; then made+=("build/tmp/$name-$a")
    else echo "  (no $a build of $name: $(tail -1 build/tmp/$name-$a.log))"; fi
  done
  [ ${#made[@]} -gt 0 ] || { echo "compile failed for $name"; cat build/tmp/$name-*.log | tail -20; exit 1; }
  lipo -create "${made[@]}" -output "build/tmp/$name"
}
echo "▸ compiling the keyboard"
compile Finglish -framework Cocoa -framework InputMethodKit -framework JavaScriptCore -- Sources/Shared/*.swift Sources/IME/*.swift
echo "▸ compiling the settings app"
compile FinglishSettings -parse-as-library -framework SwiftUI -framework AppKit -framework Carbon -- Sources/Shared/*.swift Sources/Settings/*.swift

assemble() {  # assemble <bundle> <executable> <plist template>
  local app="$1"; mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
  cp "build/tmp/$2" "$app/Contents/MacOS/$2"
  sed -e "s/@VERSION@/$VERSION/g" -e "s/@BUILD@/$BUILD/g" "$3" > "$app/Contents/Info.plist"
  plutil -lint "$app/Contents/Info.plist" >/dev/null
  cp build/icons/AppIcon.icns "$app/Contents/Resources/"
  printf 'APPL????' > "$app/Contents/PkgInfo"
}
echo "▸ assembling"
IME="build/app/Finglish.app"; SET="build/app/Finglish Settings.app"
assemble "$IME" Finglish Resources/IME-Info.plist
assemble "$SET" FinglishSettings Resources/Settings-Info.plist
cp build/icons/menu-icon.tiff "$IME/Contents/Resources/"
mkdir -p "$SET/Contents/Resources/Guide"; cp Resources/Guide/*.png "$SET/Contents/Resources/Guide/"      # the first-run guide's screenshots (Sources/Settings/GuideView.swift)
cp "$ROOT/LICENSE" "$SET/Contents/Resources/LICENSE"                                                      # the AGPL-3.0 text travels with the app
mkdir -p "$IME/Contents/Resources/engine"; for f in farsi-ime-engine.js lexicon.tsv bigrams.tsv aliases.tsv; do cp "$DIST/$f" "$IME/Contents/Resources/engine/"; done
for l in en fa; do mkdir -p "$IME/Contents/Resources/$l.lproj"; cp "Resources/$l.lproj/InfoPlist.strings" "$IME/Contents/Resources/$l.lproj/"; plutil -convert binary1 "$IME/Contents/Resources/$l.lproj/InfoPlist.strings"; done

# Signing. By default ad hoc (local use, nobody needs a developer account). With FINGLISH_SIGN_IDENTITY set — in the environment or in
# mac/signing.local.env (untracked) — the apps get a Developer ID signature with the hardened runtime, which notarization requires.
[ -f signing.local.env ] && . ./signing.local.env
IDENTITY="${FINGLISH_SIGN_IDENTITY:-}"
if [ -n "$IDENTITY" ]; then
  echo "▸ signing with Developer ID ($IDENTITY), hardened runtime"
  sign() { codesign --force --sign "$IDENTITY" --timestamp --options runtime ${2:+--entitlements "$2"} "$1"; }
else
  echo "▸ signing (ad-hoc, local use — no developer account needed)"
  sign() { codesign --force --sign - --timestamp=none "$1" 2>&1 | grep -v "replacing existing" || true; }
fi
sign "$IME" Resources/Finglish.entitlements                       # the keyboard first: the copy inside the settings app carries this signature
mkdir -p "$SET/Contents/Resources/Keyboard"
ditto "$IME" "$SET/Contents/Resources/Keyboard/Finglish.bundle"   # not named ".app": macOS must not list it as a second application
sign "$SET"
codesign --verify --strict "$IME" && codesign --verify --strict "$SET" && codesign --verify --strict "$SET/Contents/Resources/Keyboard/Finglish.bundle"

echo "✔ built:"; du -sh "$IME" "$SET" | sed 's/^/   /'
lipo -archs "$IME/Contents/MacOS/Finglish" | sed 's/^/   architectures: /'
