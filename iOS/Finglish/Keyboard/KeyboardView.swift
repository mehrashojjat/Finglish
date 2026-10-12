import SwiftUI

final class FinglishSuggestionModel: ObservableObject {
    @Published private(set) var candidate: CandidateModel?
    var onSuggestion: ((Int) -> Void)?

    func update(_ candidate: CandidateModel?) {
        if Thread.isMainThread {
            self.candidate = candidate
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.candidate = candidate
            }
        }
    }
}

struct FinglishSuggestionBar: View {
    @ObservedObject var model: FinglishSuggestionModel

    var body: some View {
        Group {
            if let candidate = model.candidate {
                HStack(spacing: 0) {
                    let rows = Array(candidate.rows.prefix(3))
                    if rows.isEmpty {
                        Text(candidate.label.isEmpty ? candidate.raw : candidate.label)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                    } else {
                        ForEach(Array(rows.enumerated()), id: \.offset) { item in
                            Button {
                                model.onSuggestion?(candidate.firstIndex + item.offset)
                            } label: {
                                Text(item.element)
                                    .font(.system(size: 19))
                                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)

                            if item.offset < rows.count - 1 {
                                Divider().frame(height: 24)
                            }
                        }
                    }
                }
                .padding(.horizontal, 8)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(Color(uiColor: .systemBackground).opacity(0.96))
                .overlay(alignment: .bottom) { Divider() }
            } else {
                Color.clear.frame(height: 0)
            }
        }
    }
}
