# Finglish for iOS

This folder contains the Xcode project for the iOS Finglish app and its custom keyboard extension. It targets iOS 26 and newer.

## Local signing setup

The project keeps Apple signing values out of source control while allowing
each developer to build and run it normally. Copy the example configuration
and replace `YOUR_TEAM_ID` with the Team ID shown in Xcode:

```sh
cp iOS/Signing.local.xcconfig.example iOS/Signing.local.xcconfig
```

`Signing.local.xcconfig` is ignored by Git. The committed `Signing.xcconfig`
loads it automatically, so the local Team ID is available to Xcode without
being included in commits or pull requests.

## Important iOS limitation

iOS does not expose the Apple keyboard as a surface that another app can augment. A custom keyboard extension replaces the current keyboard and must provide its keyboard view. It also cannot draw a floating panel over the host app or read the caret's screen coordinates.

The extension therefore delegates all key geometry, sizing, number/symbol pages, shift behavior, callouts, feedback, and device adaptation to the pinned MIT-licensed KeyboardKit 9.9.0 standard keyboard view. Finglish only supplies Latin-to-Persian input actions and keeps the candidates in one suggestion bar at the top of the keyboard. It shows at most the first three Persian candidates; there is no second overlay. This is the closest systemwide behavior that Apple's public keyboard-extension API allows.

## Test on an iPhone

1. Open `Finglish.xcodeproj` in Xcode 26 or newer. Sign in to Xcode with the Apple Developer account that owns the app identifiers, if needed.
2. The app target uses bundle identifier `com.mehrashojjat.finglish` and the keyboard extension uses `com.mehrashojjat.finglish.keyboard`. They load the Team ID from the ignored `Signing.local.xcconfig`; you should not need to choose a team in the project or save one into `project.pbxproj`. Keep the existing App Groups capability `group.com.finglish.ios` enabled on both targets; it is intentionally separate from the bundle identifiers so shared settings and engine data remain available.
3. Select your connected iPhone as the run destination and run the `Finglish` scheme.
4. In the app, tap **باز کردن تنظیمات صفحه‌کلید** to open Finglish’s own Settings page.
5. To add or remove the keyboard itself, iOS requires **Settings → General → Keyboard → Keyboards → Add New Keyboard → Finglish**. Apple does not provide an App Store-safe API for changing that list from inside the app. Finglish does not request **Allow Full Access** and does not use network or cellular data.
6. Return to the app. The test field is available immediately; hold the globe key and choose Finglish. Type Latin letters such as `salam`, tap a suggestion, or press Space to accept the highlighted suggestion.

Xcode resolves KeyboardKit through Swift Package Manager. The project pins the exact MIT release commit, so Xcode may ask to download the package the first time it builds.

The app intentionally does not show a green “keyboard added” status. iOS does not expose an App Store-safe API for the containing app to identify whether this exact third-party keyboard is enabled, whether its Settings toggle is on, or whether Full Access is on. A handshake can prove that the extension launched once, but it cannot prove that the user has not removed or disabled it later. The app therefore keeps the test field usable and treats keyboard setup as system-managed.

The keyboard extension does not request open access. The transliteration engine and its resources are bundled locally, and the project contains no network feature or cellular-data requirement. The app and extension continue to use the existing App Group for the settings and learned-choice data that are shared in the current build.

To test learned choices, leave **یادگیری از انتخاب‌های من** enabled, then type an ambiguous Latin word in the keyboard and deliberately choose a non-default Persian suggestion once. Switch away from Finglish and back, then type the same word again; the chosen suggestion should now rank first. Tap **فراموش کردن انتخاب‌های یادگرفته‌شده**, then switch away from Finglish and back once more before retesting. This restart matters because the Forget button removes the persisted shared data, while an already-running keyboard process may still hold its previous model in memory.

The keyboard extension uses the same transliteration engine and channel, but a compact 40,000-entry frequency-sorted lexicon. Its heavier macOS/web OOV and morphology models are left out of the extension process because iOS applies a separate, much tighter memory budget to custom keyboards. When no suitable lexicon word is visible, the iOS profile reserves the final suggestion row for a lightweight exact Persian letter-by-letter spelling, so names and uncommon words remain typeable without loading those larger models. The full 292,000-entry package remains unchanged for macOS and the website.

No notarization or distribution signing is included here. Xcode still needs the corresponding Apple Developer account signed in locally to install on a device, but the Team ID itself stays in the ignored local configuration.

When the transliteration engine changes, run `npm run bundle`; the bundler refreshes `engine/dist/`, the website assets, and this Xcode target's compact keyboard resources.
