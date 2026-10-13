import KeyboardKit
import SwiftUI
import UIKit

final class KeyboardViewController: KeyboardInputViewController, SessionClient {
    private let suggestionModel = FinglishSuggestionModel()
    private var session: Session!
    private var engineObserver: NSObjectProtocol?
    private var engineStartRequested = false

    override func viewDidLoad() {
        super.viewDidLoad()

        // Finglish accepts Latin input and converts it to Persian. Keep the
        // framework's standard English QWERTY layout even though the extension
        // advertises Persian as its primary language.
        useEnglishKeyboardLocale()

        session = Session(settings: SharedStore.loadSettings(), engine: EngineHost.shared)
        session.client = self
        services.actionHandler = FinglishActionHandler(controller: self)

        suggestionModel.onSuggestion = { [weak self] index in
            self?.session.pick(index)
        }

        engineObserver = NotificationCenter.default.addObserver(
            forName: .finglishEngineReady,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.session.engineBecameReady()
        }
    }

    deinit {
        if let engineObserver {
            NotificationCenter.default.removeObserver(engineObserver)
        }
    }

    override func viewWillSetupInitialKeyboardType() {
        useEnglishKeyboardLocale()
        super.viewWillSetupInitialKeyboardType()
    }

    override func viewWillSetupKeyboardView() {
        setupKeyboardView { controller in
            let owner = controller as! KeyboardViewController
            return KeyboardKit.KeyboardView(
                state: controller.state,
                services: controller.services,
                buttonContent: { params in
                    FinglishKeyboardButtonContent(
                        action: params.item.action,
                        standard: params.view
                    )
                },
                buttonView: { $0.view },
                collapsedView: { $0.view },
                emojiKeyboard: { $0.view },
                toolbar: { _ in FinglishSuggestionBar(model: owner.suggestionModel) }
            )
            .keyboardButtonStyle { params in
                var style = params.standardStyle(for: controller.state.keyboardContext)

                // KeyboardKit treats Shift as a system action and gives it a
                // dark idle background. Finglish's keyboard uses the same
                // light key treatment for Shift as for character keys.
                if case .shift = params.action {
                    let characterStyle = KeyboardAction.character("a")
                        .standardButtonStyle(
                            for: controller.state.keyboardContext,
                            isPressed: params.isPressed
                        )
                    style.backgroundColor = characterStyle.backgroundColor
                    style.foregroundColor = characterStyle.foregroundColor
                }

                return style
            }
        }
    }

    override func viewWillSyncWithContext() {
        super.viewWillSyncWithContext()
        useEnglishKeyboardLocale()
    }

    private func useEnglishKeyboardLocale() {
        state.keyboardContext.locale = .english_us
        state.keyboardContext.locales = [.english_us]

        // The visual layout is Latin QWERTY, but this is still a Farsi
        // keyboard from iOS's point of view. KeyboardKit normally derives
        // primaryLanguage from locale, so restore the extension identity
        // after selecting the visual locale.
        state.keyboardContext.primaryLanguage = "fa"
        primaryLanguage = "fa"
    }

    // MARK: Session input bridge

    func handleKeyboardKey(_ key: Key) {
        startEngineIfNeeded()
        let consumed = session.handle(key)
        guard !consumed else { return }

        switch key {
        case .char(let character): textDocumentProxy.insertText(String(character))
        case .backspace: textDocumentProxy.deleteBackward()
        case .space: textDocumentProxy.insertText(" ")
        case .enter: textDocumentProxy.insertText("\n")
        default: break
        }
    }

    private func startEngineIfNeeded() {
        guard !engineStartRequested else { return }
        engineStartRequested = true
        EngineHost.shared.start()
    }

    // MARK: UITextDocumentProxy bridge

    func setMarked(_ text: String) {
        if text.isEmpty {
            textDocumentProxy.setMarkedText("", selectedRange: NSRange(location: 0, length: 0))
            textDocumentProxy.unmarkText()
            return
        }
        textDocumentProxy.setMarkedText(text, selectedRange: NSRange(location: 0, length: text.utf16.count))
    }

    func commit(_ text: String) {
        // The entire marked preview is selected by setMarked(_:), so insertText replaces it atomically.
        textDocumentProxy.insertText(text)
    }

    func textBeforeCaret() -> String {
        textDocumentProxy.documentContextBeforeInput ?? ""
    }

    func show(_ model: CandidateModel?) {
        suggestionModel.update(model)
    }

    override func textWillChange(_ textInput: UITextInput?) {
        super.textWillChange(textInput)
        session.settings = SharedStore.loadSettings()
    }

    override func textDidChange(_ textInput: UITextInput?) {
        super.textDidChange(textInput)
        session.settings = SharedStore.loadSettings()
    }
}

private final class FinglishActionHandler: KeyboardAction.StandardActionHandler {
    weak var finglishController: KeyboardViewController?

    init(controller: KeyboardViewController) {
        finglishController = controller
        super.init(
            controller: controller,
            keyboardContext: controller.state.keyboardContext,
            keyboardBehavior: controller.services.keyboardBehavior,
            autocompleteContext: controller.state.autocompleteContext,
            autocompleteService: controller.services.autocompleteService,
            emojiContext: controller.state.emojiContext,
            feedbackContext: controller.state.feedbackContext,
            feedbackService: controller.services.feedbackService,
            spaceDragGestureHandler: controller.services.spaceDragGestureHandler
        )
    }

    override func handle(_ action: KeyboardAction) {
        guard let controller = finglishController else { return }

        switch action {
        case .character(let text), .characterMargin(let text), .text(let text):
            for character in text {
                controller.handleKeyboardKey(.char(character))
            }
        case .backspace:
            controller.handleKeyboardKey(.backspace)
        case .space:
            controller.handleKeyboardKey(.space)
        case .primary:
            controller.handleKeyboardKey(.enter)
        case .escape:
            controller.handleKeyboardKey(.escape)
        default:
            // KeyboardKit keeps ownership of shift, number/symbol switching,
            // cursor movement, feedback, and the system keyboard switcher.
            super.handle(action)
        }
    }

    override func handle(_ gesture: Keyboard.Gesture, on action: KeyboardAction) {
        switch action {
        case .character, .characterMargin, .text, .space, .primary, .escape:
            if gesture == .press && action != .space {
                tryTriggerFeedback(for: gesture, on: action)
            }
            if gesture == .release {
                handle(action)
            } else if action == .space {
                // Preserve KeyboardKit's space-bar drag behavior.
                super.handle(gesture, on: action)
            }
        case .backspace:
            if gesture == .press || gesture == .repeatPress {
                tryTriggerFeedback(for: gesture, on: action)
                handle(action)
            }
        default:
            super.handle(gesture, on: action)
        }
    }
}
