// The settings form (SwiftUI). Everything the user reads here is Persian, laid out right-to-left.
import SwiftUI
import AppKit

struct SettingsView: View {
    @State private var s = UserFiles.loadSettings()
    @State private var status = Registrar.status()
    @State private var message = ""
    @State private var guideOpen: Bool                                  // the first-run guide: first time only (see Onboarding)
    init(guide: Bool? = nil) { _guideOpen = State(initialValue: guide ?? Onboarding.shouldShowGuide(done: Onboarding.done, keyboardAdded: Registrar.status() == .enabled)) }
    @State private var blocked: String? = Setup.isRunningFromDiskImage ? Setup.fromDiskImageFa : nil

    /// 6 → ۶ (the numbers in the pickers are shown with Persian digits)
    private func fa(_ n: Int) -> String { n.formatted(.number.locale(Locale(identifier: "fa_IR"))) }

    private func openKeyboardSettings() { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.Keyboard-Settings.extension")!) }

    var body: some View {
        Group {
            if let blocked { BlockedView(text: blocked) } else { form }
        }
        .frame(width: 560, height: 660)          // fits any screen; the grouped form scrolls inside
        // the first-run guide lies ON TOP of the settings (a sheet), the first time only; closing it in any way ends the first time
        .sheet(isPresented: Binding(get: { guideOpen && blocked == nil }, set: { guideOpen = $0; if !$0 { Onboarding.done = true } })) {
            GuideView(onDone: { guideOpen = false; Onboarding.done = true }, openKeyboardSettings: openKeyboardSettings)
        }
        .onChange(of: s) { _, v in UserFiles.saveSettings(v) }
        .onReceive(Timer.publish(every: 1.5, on: .main, in: .common).autoconnect()) { _ in
            status = Registrar.status()          // live, both ways: green when the user adds the keyboard, back to the warning when they remove it
        }
        .onChange(of: status) { old, new in
            if new == .enabled && old != .enabled {                                // the moment the keyboard shows up in the user's list
                Onboarding.done = true; guideOpen = false; message = ""        // the green status says it all
            } else if old == .enabled && new != .enabled {                         // taken out of the list again: only the status changes — no slides
                message = ""
            }
        }
        .onAppear {
            status = Registrar.status()
            // The first launch is the installation: copy the keyboard into place and tell macOS about it. Later launches only check.
            DispatchQueue.main.async {
                let r = Setup.run(force: false)
                if r.blocking { blocked = r.fa } else if !r.quiet { message = r.fa }
                status = Registrar.status()
                if status == .enabled { Onboarding.done = true; guideOpen = false }
            }
        }
    }

    /// The one small line at the very bottom, centred: copyright and licence (the website's footer says the same).
    private var footer: some View {
        HStack(spacing: 4) {
            Text(AboutInfo.copyright)
            Link(AboutInfo.licenseName, destination: AboutInfo.licenseURL)
        }
        .font(.caption).foregroundStyle(.secondary)
        .frame(maxWidth: .infinity).padding(.top, 2).padding(.bottom, 10)
        .environment(\.layoutDirection, .rightToLeft)
    }

    private var form: some View {
        VStack(spacing: 0) {
            settingsForm
            footer
        }
    }

    private var settingsForm: some View {
        Form {
            Section("صفحه‌کلید") {
                HStack {
                    Image(systemName: status == .enabled ? "checkmark.circle.fill" : "exclamationmark.circle").foregroundStyle(status == .enabled ? .green : .orange)
                    Text(status.persian)
                    Spacer()
                    Button("باز کردن تنظیمات صفحه‌کلید") { openKeyboardSettings() }
                }
                if status != .enabled && status != .notInstalled {
                    // the same three steps as the guide, until the keyboard has been added
                    VStack(alignment: .leading, spacing: 6) {
                        Text("یک کار مانده: صفحه‌کلید فینگلیش را به فهرست صفحه‌کلیدهای سیستم اضافه کنید").font(.headline)
                        ForEach(GuideText.steps.indices, id: \.self) { Text(GuideText.fa(GuideText.steps[$0].text)).fixedSize(horizontal: false, vertical: true) }
                        Text(GuideText.fa(GuideText.note)).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        Text(GuideText.fa(GuideText.statusHint)).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        Button("دیدن راهنمای تصویری") { guideOpen = true }
                    }
                }
                if !message.isEmpty { Text(GuideText.fa(message)).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
            }
            Section("تایپ") {
                Picker("تعداد پیشنهادها در هر صفحه", selection: $s.pageSize) { ForEach([5, 6, 7, 9], id: \.self) { Text(fa($0)).tag($0) } }
                Toggle("نمایش کلمهٔ انتخاب‌شده داخل متن", isOn: $s.inlinePreview)
                Toggle("گزینهٔ «نوشتن متن به انگلیسی» آخر فهرست باشد (کلید صفر)", isOn: $s.showLatin)
                Toggle("بعد از انتخاب با عدد، خودکار فاصله بیفتد", isOn: $s.autoSpace)
                Toggle("فقط فاصله (Space) کلمه را تایید کند؛ علامت‌ها به کلمه می‌چسبند (\u{2066}salam?\u{2069} ← سلام؟). ایمیل و لینک هم همان‌طور که تایپ شده می‌ماند (آزمایشی)", isOn: $s.onlySpaceCommits)
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("علامت‌هایی که جزو کلمه حساب می‌شوند")
                        Spacer()
                        TextField("", text: $s.wordSigns).font(.system(size: 15, design: .monospaced)).textFieldStyle(.roundedBorder).frame(width: 300)
                            .environment(\.layoutDirection, .leftToRight)       // the signs are Latin characters: keep them left-to-right
                        Button("بازنشانی") { s.wordSigns = Settings.defaultWordSigns }
                    }
                    Text("هر علامتی که داخل این کادر باشد، موقع تایپ جزو کلمه می‌ماند و کلمه فقط با Space، Enter یا کلید صفر تایید می‌شود. علامت‌هایی که بعد از حرف‌ها بیایند روی کلمهٔ فارسی می‌مانند (\u{2066}salam?\u{2069} ← سلام؟)؛ ولی اگر بعد از علامت حرف بیاید (مثل me@example.com)، متن همان‌طور که تایپ شده می‌ماند. اگر می‌خواهید علامتی کلمه را تایید کند، آن را از کادر پاک کنید.").font(.caption).foregroundStyle(.secondary)
                }.disabled(!s.onlySpaceCommits)
            }
            Section("متن فارسی") {
                Toggle("ارقام فارسی (۱ ۲ ۳)", isOn: $s.persianDigits)
                Toggle("نقطه‌گذاری فارسی (، ؛ ؟)", isOn: $s.mapPunct)
                Toggle("نیم‌فاصله خودکار گذاشته شود، هر جا که املای درست می‌خواهد: «می‌خواهم» به‌جای «میخواهم» (آزمایشی)",
                       isOn: Binding(get: { s.zwnj == "auto" }, set: { s.zwnj = $0 ? "auto" : "off" }))
            }
            Section("هوشمندی") {
                Toggle("برای تشخیص بهتر، کلمهٔ قبلی هم در نظر گرفته شود", isOn: $s.context)
                Toggle("یادگیری از انتخاب‌های من", isOn: $s.learn)
                HStack {
                    Button("فراموش کردن چیزهایی که یاد گرفته") { try? FileManager.default.removeItem(at: UserFiles.learned); UserFiles.saveText("", to: UserFiles.learned) }
                    Text("(از دفعهٔ بعد که صفحه‌کلید را باز می‌کنید اثر می‌کند)").font(.caption).foregroundStyle(.secondary)
                }
            }
            Section("حافظه") {
                Picker("آزاد کردن حافظه، بعد از رفتن به صفحه‌کلید دیگر", selection: $s.unloadAfterMinutes) {
                    Text("\(fa(1)) دقیقه").tag(1); Text("\(fa(5)) دقیقه").tag(5); Text("\(fa(15)) دقیقه").tag(15); Text("\(fa(1)) ساعت").tag(60); Text("هرگز").tag(0)
                }
                Text("موتور تبدیل (حدود صد مگابایت) فقط وقتی داخل حافظه است که با فینگلیش تایپ می‌کنید. وقتی با صفحه‌کلید دیگری تایپ می‌کنید، هیچ چیزی اجرا نمی‌شود.").font(.caption).foregroundStyle(.secondary)
            }
            Section("درباره") {
                HStack(alignment: .top, spacing: 14) {
                    Image(nsImage: AboutInfo.icon).resizable().frame(width: 64, height: 64)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("فینگلیش").font(.title2.bold())
                        if !AboutInfo.version.isEmpty { Text(GuideText.fa("نسخهٔ " + GuideText.name(AboutInfo.version))).font(.caption).foregroundStyle(.secondary) }
                        Text(GuideText.fa(AboutInfo.blurb)).fixedSize(horizontal: false, vertical: true).padding(.top, 2)
                        HStack(spacing: 4) {
                            Text("سازنده:")
                            Link("مهراس حجت", destination: AboutInfo.website)
                        }.padding(.top, 2)
                    }
                }
            }
        }
        .formStyle(.grouped)
        .environment(\.layoutDirection, .rightToLeft)
        .padding(.bottom, 8)
    }
}
