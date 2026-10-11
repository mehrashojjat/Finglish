// The "About" section at the bottom of the settings: icon, name, version, one short description, and who made it.
import AppKit

enum AboutInfo {
    static let website = URL(string: "https://mehrashojjat.com")!
    /// Finglish's own website, and the source code (AGPL: whoever gets the app can always find the source it was built from).
    static let siteName = "finglish.mehrashojjat.com"
    static let site = URL(string: "https://finglish.mehrashojjat.com")!
    static let source = URL(string: "https://github.com/mehrashojjat/Finglish")!

    /// Version as written on the app (1.0.0). Latin digits on purpose: in Persian the digit ۰ looks like a dot.
    static var version: String { (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "" }

    /// Two sentences: what it does, and — the point — that it all happens on this Mac. (The Mac apps contain no network code at all.)
    private static let salam = GuideText.name("salam")
    static let blurb = "با حروف لاتین فارسی بنویسید: \(salam) را تایپ کنید و سلام بگیرید. فینگلیش کاملاً روی سیستم شما اجرا می‌شود؛ اینترنت لازم نیست و چیزی از آنچه تایپ می‌کنید به جایی فرستاده نمی‌شود."

    /// The word lists inside the app are built from CC BY-SA 4.0 data, so the app credits it; the website's «داده‌ها و منابع» has the full credits.
    static let dataCredit = "فهرست واژه‌ها از ویکی‌پدیای فارسی، ویکی‌واژه و شمارش واژه‌های زیرنویس فیلم‌ها ساخته شده و مانند داده‌های ویکی‌پدیا و ویکی‌واژه با مجوز CC BY-SA 4.0 است."
    static let credits = URL(string: "https://finglish.mehrashojjat.com/#about")!

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
