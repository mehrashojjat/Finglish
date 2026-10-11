#!/bin/bash
# Remove the keyboard and settings app.  Add --purge to also delete your settings and learned choices.   mac/uninstall.sh [--purge]
set -uo pipefail
IM="$HOME/Library/Input Methods"
for APPS in /Applications "$HOME/Applications"; do
  [ -x "$APPS/Finglish Settings.app/Contents/MacOS/FinglishSettings" ] && "$APPS/Finglish Settings.app/Contents/MacOS/FinglishSettings" --unregister   # takes it out of your keyboard list
done
pkill -x Finglish 2>/dev/null; pkill -x FinglishSettings 2>/dev/null
defaults delete com.finglish.FinglishSettings onboardingDone 2>/dev/null     # so the first-run guide shows again after a reinstall
rm -rf "$IM/Finglish.app" "/Applications/Finglish Settings.app" "$HOME/Applications/Finglish Settings.app" 2>/dev/null
if [ "${1:-}" = "--purge" ]; then rm -rf "$HOME/Library/Application Support/Finglish Keyboard"; echo "settings and learned choices deleted"; fi
echo "Finglish removed."
