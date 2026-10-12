# Finglish for iOS

This folder contains the Xcode project for the iOS Finglish app and its custom keyboard extension. It targets iOS 26 and newer.

## Important iOS limitation

iOS does not expose the Apple keyboard as a surface that another app can augment. A custom keyboard extension replaces the current keyboard and must provide its keyboard view. It also cannot draw a floating panel over the host app or read the caret's screen coordinates.

The extension therefore delegates all key geometry, sizing, number/symbol pages, shift behavior, callouts, feedback, and device adaptation to the pinned MIT-licensed KeyboardKit 9.9.0 standard keyboard view. Finglish only supplies Latin-to-Persian input actions and keeps the candidates in one suggestion bar at the top of the keyboard. It shows at most the first three Persian candidates; there is no second overlay. This is the closest systemwide behavior that Apple's public keyboard-extension API allows.

## Test on an iPhone

1. Open `Finglish.xcodeproj` in Xcode 26 or newer.
2. Select the `Finglish` app target and choose your Apple development team in Signing & Capabilities. Keep the App Groups capability enabled for `group.com.finglish.ios` on both the app and keyboard targets.
3. Select your connected iPhone as the run destination and run the `Finglish` scheme.
4. In the app, open the keyboard settings instructions. On the phone go to **Settings → General → Keyboard → Keyboards → Add New Keyboard → Finglish**.
5. Turn on **Allow Full Access**. The keyboard does not use the network; full access is required only so the extension can share its offline engine, settings, and learned choices with the settings app through the App Group container.
6. In any supported text field, hold the globe key and choose Finglish. Type Latin letters such as `salam`, tap a suggestion, or press Space to accept the highlighted suggestion.

Xcode resolves KeyboardKit through Swift Package Manager. The project pins the exact MIT release commit, so Xcode may ask to download the package the first time it builds.

The status indicator in the app is best-effort because Apple's public `UITextInputMode` API exposes a primary language, not a stable third-party keyboard identifier. If another Persian keyboard is enabled, the indicator can report that a Persian keyboard is present; the setup instructions remain the source of truth.

The keyboard extension uses the same transliteration engine and channel, but a compact 40,000-entry frequency-sorted lexicon. Its heavier macOS/web OOV, morphology, and previous-word-context models are left out of the extension process because iOS applies a separate, much tighter memory budget to custom keyboards; the full 292,000-entry package remains unchanged for macOS and the website.

No notarization or distribution signing is included here. Select a real development team in Xcode when testing on a device.

When the transliteration engine changes, run `npm run bundle`; the bundler refreshes `engine/dist/`, the website assets, and this Xcode target's compact keyboard resources.
