import SwiftUI
import UIKit

enum KeyboardStatus: Equatable {
    case enabled
    case needsSetup

    var title: String {
        switch self {
        case .enabled: return "صفحه‌کلید فینگلیش در فهرست صفحه‌کلیدهاست"
        case .needsSetup: return "صفحه‌کلید فینگلیش هنوز به فهرست اضافه نشده است"
        }
    }

    var icon: String { self == .enabled ? "checkmark.circle.fill" : "exclamationmark.circle.fill" }
    var color: Color { self == .enabled ? .green : .orange }
}

@MainActor
final class SettingsModel: ObservableObject {
    @Published var settings: Settings
    @Published var testText = ""
    @Published var status: KeyboardStatus = .needsSetup

    init() {
        settings = SharedStore.loadSettings()
        refreshStatus()
    }

    func save() {
        settings.pageSize = 3
        settings.maxCandidates = 3
        SharedStore.saveSettings(settings)
    }

    func refreshStatus() {
        // iOS exposes the primary language of active input modes, not a stable third-party bundle identifier.
        let active = UITextInputMode.activeInputModes
        status = active.contains { mode in
            mode.primaryLanguage == "fa"
        } ? .enabled : .needsSetup
    }
}

struct ContentView: View {
    @StateObject private var model = SettingsModel()
    @Environment(\.scenePhase) private var scenePhase

    private var keyboardSettingsURL: URL {
        URL(string: "App-prefs:root=General&path=Keyboard/KEYBOARDS")!
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        Image(systemName: model.status.icon)
                            .font(.title2)
                            .foregroundStyle(model.status.color)
                        Text(model.status.title)
                            .font(.headline)
                        Spacer()
                    }

                    Button("باز کردن تنظیمات صفحه‌کلید") {
                        UIApplication.shared.open(keyboardSettingsURL)
                    }

                    Text("مسیر: Settings → General → Keyboard → Keyboards → Add New Keyboard → Finglish. سپس Allow Full Access را روشن کنید تا برنامه و افزونه بتوانند تنظیمات و موتور آفلاین را از طریق App Group مشترک بخوانند.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } header: {
                    Text("وضعیت")
                }

                Section("آزمایش مستقیم") {
                    TextField("مثلاً salam", text: $model.testText)
                        .textFieldStyle(.roundedBorder)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .textContentType(.none)
                        .environment(\.layoutDirection, .leftToRight)

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
                    Text("این پروژه برای کار کردن به اینترنت نیاز ندارد و متن تایپ‌شده را ارسال نمی‌کند. Allow Full Access فقط برای اشتراک App Group بین برنامه و افزونه لازم است.")
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
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                model.settings = SharedStore.loadSettings()
                model.refreshStatus()
            }
        }
    }

    private func binding(_ keyPath: WritableKeyPath<Settings, Bool>) -> Binding<Bool> {
        Binding(
            get: { model.settings[keyPath: keyPath] },
            set: { model.settings[keyPath: keyPath] = $0; model.save() }
        )
    }
}
