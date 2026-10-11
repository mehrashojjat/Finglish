#!/bin/bash
# Install for the current user the way a user does: put the app in Applications and open it once.   mac/install.sh
#   /Applications/Finglish Settings.app      (in ~/Applications instead if /Applications is not writable)
#   ~/Library/Input Methods/Finglish.app     the keyboard — copied out of the app and added to your keyboards by the app itself (--install)
set -euo pipefail
cd "$(dirname "$0")"
[ -d "build/app/Finglish Settings.app" ] || ./build.sh
if [ -w /Applications ]; then APPS="/Applications"; else APPS="$HOME/Applications"; mkdir -p "$APPS"; fi
pkill -x FinglishSettings 2>/dev/null || true      # a Settings window left open would keep showing the OLD version
sleep 0.3
rm -rf "$APPS/Finglish Settings.app" "$HOME/Applications/Finglish Settings.app" "/Applications/Finglish Settings.app" 2>/dev/null || true   # also removes an older copy in the other place
ditto "build/app/Finglish Settings.app" "$APPS/Finglish Settings.app"
echo "▸ installing the keyboard and adding it to your keyboards"
if "$APPS/Finglish Settings.app/Contents/MacOS/FinglishSettings" --install; then :; else
  cat <<MSG

Installed. One step is left, and macOS requires you to do it yourself (an app cannot add a new keyboard for you):
  open "Finglish Settings" — its first-run guide shows the four steps with screenshots — or go to
  System Settings → Keyboard → Text Input → Edit → + → Persian → Finglish → Add, then Done
MSG
fi
cat <<MSG

  • Switch to it:  Globe key / Control-Space, or the keyboard menu in the menu bar → "فینگلیش (Finglish)".
  • Settings:      open "Finglish Settings" from the Applications folder (no Dock icon) — it also shows whether the keyboard is added.
  • Remove it:     mac/uninstall.sh
MSG
