// The "About" section at the bottom of the settings: icon, name, version, one short description, and who made it.
import AppKit

enum AboutInfo {
    static let website = URL(string: "https://mehrashojjat.com")!

    /// Version as written on the app (1.0.0). Latin digits on purpose: in Persian the digit ۰ looks like a dot.
    static var version: String { (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "" }

    /// Two sentences: what it does, and — the point — that it all happens on this Mac. (The Mac apps contain no network code at all.)
    private static let salam = GuideText.name("salam")
    static let blurb = "با حروف لاتین فارسی بنویسید: \(salam) را تایپ کنید و سلام بگیرید. فینگلیش کاملاً روی سیستم شما اجرا می‌شود؛ اینترنت لازم نیست و چیزی از آنچه تایپ می‌کنید به جایی فرستاده نمی‌شود."

    /// The footer line: «© ۲۰۲۶ مهراس حجت · مجوز AGPL-3.0» (the licence name is a link to the licence text).
    static let copyright = "© ۲۰۲۶ مهراس حجت · مجوز"
    static let licenseName = "AGPL-3.0"
    static let licenseURL = URL(string: "https://www.gnu.org/licenses/agpl-3.0.html")!

    /// The app's own icon (FINGLISH_ICON points the layout preview at the icon file, since the preview is not an app bundle).
    static var icon: NSImage {
        if let f = ProcessInfo.processInfo.environment["FINGLISH_ICON"], let i = NSImage(contentsOfFile: f) { return i }
        return NSApp.applicationIconImage
    }
}
