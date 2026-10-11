#!/bin/bash
# Build the disk image users open: the app next to an "Applications" shortcut, so installing is one drag.   mac/make_dmg.sh
#   dist/Finglish-<version>.dmg      the file to hand out: the app and an Applications shortcut, nothing else
#   dist/Finglish Settings.app       the same app, ready to copy into /Applications yourself
#   --publish                        also copy the image to ../downloads/Finglish.dmg — the file the website's download button serves —
#                                    and write the version into the website's download dialog (index.html)
# No package, no installer, no third-party tool: just hdiutil, which every Mac has. Opening the app for the first time installs the
# keyboard and adds it to the user's keyboards (see Sources/Settings/Setup.swift).
set -euo pipefail
cd "$(dirname "$0")"
PUBLISH=0; [ "${1:-}" = "--publish" ] && PUBLISH=1
./build.sh
APP="build/app/Finglish Settings.app"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")"
DMG="dist/Finglish-$VERSION.dmg"
STAGE="build/dmg"; MOUNT="build/dmg-mount"

echo "▸ preparing the disk image contents"
rm -rf "$STAGE" "$MOUNT" dist; mkdir -p "$STAGE" dist
ditto "$APP" "$STAGE/Finglish Settings.app"
ln -s /Applications "$STAGE/Applications"                      # the drop target
echo "▸ building the disk image"
hdiutil create -quiet -volname "Finglish" -srcfolder "$STAGE" -ov -format UDZO -imagekey zlib-level=9 -fs HFS+ "$DMG"
ditto "$APP" "dist/Finglish Settings.app"
[ -f signing.local.env ] && . ./signing.local.env
if [ -n "${FINGLISH_SIGN_IDENTITY:-}" ] && [ -n "${FINGLISH_NOTARY_PROFILE:-}" ]; then
  echo "▸ signing the image and sending it to Apple for notarization (a few minutes)"
  codesign --force --sign "$FINGLISH_SIGN_IDENTITY" --timestamp "$DMG"
  xcrun notarytool submit "$DMG" --keychain-profile "$FINGLISH_NOTARY_PROFILE" --wait
  xcrun stapler staple "$DMG"
  xcrun stapler validate "$DMG"
  NOTARIZED=1
else NOTARIZED=0; fi

echo "▸ checking it the way a user would open it"
hdiutil verify -quiet "$DMG"
mkdir -p "$MOUNT"
hdiutil attach -quiet -nobrowse -readonly -noautoopen -mountpoint "$MOUNT" "$DMG"
trap 'hdiutil detach -quiet "$MOUNT" 2>/dev/null || true' EXIT
fail() { echo "✘ $1"; exit 1; }
[ -d "$MOUNT/Finglish Settings.app" ]                                                        || fail "the app is missing from the image"
[ "$(readlink "$MOUNT/Applications")" = "/Applications" ]                                    || fail "the Applications shortcut is missing"
[ -d "$MOUNT/Finglish Settings.app/Contents/Resources/Keyboard/Finglish.bundle" ]            || fail "the keyboard is not inside the app"
[ "$(ls "$MOUNT/Finglish Settings.app/Contents/Resources/Guide/"*.png 2>/dev/null | wc -l | tr -d ' ')" = "4" ] || fail "the guide's four screenshots are not inside the app"
[ -s "$MOUNT/Finglish Settings.app/Contents/Resources/LICENSE" ]                               || fail "the licence text is not inside the app"
[ "$(ls -A "$MOUNT" | wc -l | tr -d ' ')" = "2" ]                                            || fail "the image should hold only the app and the Applications shortcut"
codesign --verify --strict "$MOUNT/Finglish Settings.app"                                    || fail "the app's signature does not verify"
codesign --verify --strict "$MOUNT/Finglish Settings.app/Contents/Resources/Keyboard/Finglish.bundle" || fail "the keyboard's signature does not verify"
ARCHS="$(lipo -archs "$MOUNT/Finglish Settings.app/Contents/MacOS/FinglishSettings")"
case "$ARCHS" in *arm64*x86_64*|*x86_64*arm64*) ;; *) fail "not universal ($ARCHS)";; esac
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$MOUNT/Finglish Settings.app/Contents/Info.plist")" = \
  "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$MOUNT/Finglish Settings.app/Contents/Resources/Keyboard/Finglish.bundle/Contents/Info.plist")" ] || fail "app and keyboard are different builds"
if [ "$NOTARIZED" = "1" ]; then
  spctl --assess --type execute -vv "$MOUNT/Finglish Settings.app" 2>&1 | grep -q "accepted" || fail "Gatekeeper does not accept the app (notarization)"
  spctl --assess --type open --context context:primary-signature -vv "$DMG" 2>&1 | grep -q "accepted" || fail "Gatekeeper does not accept the image"
fi
hdiutil detach -quiet "$MOUNT"; trap - EXIT

echo "✔ $(du -h "$DMG" | cut -f1)  $DMG        (architectures: $ARCHS, macOS 26+)"
echo "✔ dist/Finglish Settings.app  — copy it into Applications to try it, exactly as a user would"

if [ "$PUBLISH" = "1" ]; then
  SITE="$(cd .. && pwd)"
  mkdir -p "$SITE/downloads"; rm -f "$SITE"/downloads/*.dmg
  cp "$DMG" "$SITE/downloads/Finglish.dmg"
  sed -i '' -E "s|(id=\"dl-version\">)[0-9.]+(<)|\1$VERSION\2|;" "$SITE/index.html"
  echo "✔ published: downloads/Finglish.dmg  (the website's download button saves it as Finglish.dmg)"
fi
