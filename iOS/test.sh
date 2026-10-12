#!/bin/zsh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
build="$root/iOS/build"
mkdir -p "$build"

if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app/Contents/Developer ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

cp "$root/iOS/Tests/SessionTests.swift" "$build/main.swift"
xcrun swiftc -swift-version 5 -O -module-cache-path "$build/ModuleCache" \
  "$root/iOS/Finglish/Shared/IOSSettings.swift" \
  "$root/iOS/Finglish/Shared/Session.swift" \
  "$build/main.swift" \
  -o "$build/session-tests"
"$build/session-tests"

for plist in \
  "$root/iOS/Finglish/Resources/AppInfo.plist" \
  "$root/iOS/Finglish/Resources/KeyboardInfo.plist" \
  "$root/iOS/Finglish/Resources/Finglish.entitlements" \
  "$root/iOS/Finglish/Resources/FinglishKeyboard.entitlements" \
  "$root/iOS/Finglish/Resources/PrivacyInfo.xcprivacy"; do
  plutil -lint "$plist" >/dev/null
done

echo "PASS iOS plist validation"

if rg -n 'DEVELOPMENT_TEAM = [A-Za-z0-9]' \
  "$root/iOS/Finglish.xcodeproj/project.pbxproj" >/dev/null; then
  echo "FAIL iOS project contains a literal DEVELOPMENT_TEAM; keep it in Signing.local.xcconfig" >&2
  exit 1
fi

echo "PASS iOS local signing configuration"
