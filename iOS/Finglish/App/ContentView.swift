import SwiftUI
import UIKit

@MainActor
final class SettingsModel: ObservableObject {
    @Published var settings: Settings
    @Published var testText = ""

    init() {
        settings = SharedStore.loadSettings()
    }

    func save() {
        settings.pageSize = 3
        settings.maxCandidates = 3
        SharedStore.saveSettings(settings)
    }

}

struct ContentView: View {
    @StateObject private var model = SettingsModel()

    private func openSettings() {
        guard let settingsURL = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(settingsURL)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("تنظیم صفحه‌کلید توسط iOS مدیریت می‌شود", systemImage: "info.circle")

                    Button("باز کردن تنظیمات صفحه‌کلید") {
                        openSettings()
                    }

                    Text("برای افزودن یا حذف Finglish: Settings → General → Keyboard → Keyboards. Finglish کاملاً آفلاین است و از اینترنت یا دادهٔ تلفن همراه استفاده نمی‌کند.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } header: {
                    Text("وضعیت")
                }

                Section("آزمایش مستقیم") {
                    TextField("مثلاً salam", text: $model.testText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)

                    Text("اگر Finglish در فهرست صفحه‌کلیدها اضافه شده، با دکمهٔ کره آن را انتخاب کنید. اگر اضافه نشده، از دکمهٔ تنظیمات بالا استفاده کنید.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)

                    HStack {
                        Text("اینجا بنویسید و Space بزنید تا پیشنهادهای فینگلیش را امتحان کنید.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Spacer(minLength: 8)
                        if !model.testText.isEmpty {
                            Button("پاک کردن") {
                                model.testText = ""
                            }
                            .font(.footnote)
                        }
                    }
                }

                Section("پیشنهادها") {
                    HStack {
                        Label("نوار پیشنهادها", systemImage: "rectangle.topthird.inset.filled")
                        Spacer()
                        Text("۳ پیشنهاد اول")
                            .foregroundStyle(.secondary)
                    }
                    Text("iOS اجازهٔ نمایش پنجرهٔ شناور روی متن یا روی صفحه‌کلید Apple را به افزونه نمی‌دهد؛ بنابراین پیشنهادها همیشه فقط در همین نوار بالای صفحه‌کلید نشان داده می‌شوند و دو بار نمایش داده نمی‌شوند.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("تایپ") {
                    Toggle("بعد از انتخاب پیشنهاد، فاصله بیفتد", isOn: binding(\.autoSpace))
                    Toggle("نمایش کلمهٔ انتخاب‌شده داخل متن", isOn: binding(\.inlinePreview))
                    Toggle("فقط Space و Return کلمه را تأیید کنند؛ علامت‌ها بچسبند", isOn: binding(\.onlySpaceCommits))
                    Toggle("نقطه‌گذاری فارسی (، ؛ ؟)", isOn: binding(\.mapPunct))
                    Toggle("ارقام فارسی (۱ ۲ ۳)", isOn: binding(\.persianDigits))
                }

                Section("متن فارسی") {
                    Toggle("نیم‌فاصلهٔ خودکار گذاشته شود", isOn: Binding(
                        get: { model.settings.zwnj == "auto" },
                        set: { model.settings.zwnj = $0 ? "auto" : "off"; model.save() }
                    ))
                    Toggle("برای تشخیص بهتر، کلمهٔ قبلی هم در نظر گرفته شود", isOn: binding(\.context))
                    Toggle("یادگیری از انتخاب‌های من", isOn: binding(\.learn))
                    Button("فراموش کردن انتخاب‌های یادگرفته‌شده") {
                        SharedStore.forgetLearned()
                    }
                }

                Section("حریم خصوصی") {
                    Label("تبدیل و پیشنهادها کاملاً روی خود آیفون انجام می‌شوند.", systemImage: "lock.shield")
                    Text("این پروژه برای کار کردن به اینترنت نیاز ندارد و متن تایپ‌شده را به سروری ارسال نمی‌کند؛ تمام پردازش‌ها کاملاً آفلاین روی دستگاه انجام می‌شوند.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("درباره") {
                    HStack {
                        Image(systemName: "character.cursor.ibeam")
                            .font(.title2)
                            .foregroundStyle(.tint)
                        VStack(alignment: .leading) {
                            Text("فینگلیش").font(.headline)
                            Text("تایپ فارسی با حروف لاتین، آفلاین و خصوصی")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Text("پشتیبانی: iOS 26 و جدیدتر")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("تنظیمات فینگلیش")
            .environment(\.layoutDirection, .rightToLeft)
        }
    }

    private func binding(_ keyPath: WritableKeyPath<Settings, Bool>) -> Binding<Bool> {
        Binding(
            get: { model.settings[keyPath: keyPath] },
            set: { model.settings[keyPath: keyPath] = $0; model.save() }
        )
    }
}
