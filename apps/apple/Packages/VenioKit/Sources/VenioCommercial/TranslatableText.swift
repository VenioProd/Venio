import SwiftUI
import VenioTheme
#if canImport(Translation) && !os(watchOS)
import Translation
import NaturalLanguage
#endif

public struct TranslatableText: View {
    @Environment(ThemeManager.self) private var preferences
    @Environment(\.locale) private var locale
    private let original: String
    private let preservedTerms: [String]
    @State private var translation: String?
    @State private var showsOriginal = false
    @State private var requestCount = 0
    @State private var manuallyRequestedFor: String?
    @State private var sourceLanguage: String?

    public init(_ text: String, preserving terms: [String] = []) {
        original = text
        preservedTerms = terms
    }
    private var target: String { locale.language.languageCode?.identifier ?? "fr" }
    private var identity: String { original + target + String(preferences.selection.autoTranslate) }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(verbatim: showsOriginal ? original : (translation ?? original))
            #if canImport(Translation) && !os(watchOS)
            if translation != nil {
                Button { showsOriginal.toggle() } label: {
                    Label {
                        VText(showsOriginal ? "Original" : "Traduit")
                    } icon: { Image(systemName: "translate").accessibilityHidden(true) }
                }.font(.caption).buttonStyle(.plain)
            } else if sourceLanguage != nil && sourceLanguage != target && !preferences.selection.autoTranslate {
                Button { manuallyRequestedFor = identity; requestCount += 1 } label: { VText("Traduire") }.font(.caption)
            }
            #endif
        }
        #if canImport(Translation) && !os(watchOS)
        .task(id: identity + String(requestCount)) {
            translation = nil
            showsOriginal = false
            let recognizer = NLLanguageRecognizer()
            recognizer.processString(original)
            sourceLanguage = recognizer.dominantLanguage?.rawValue
            if preferences.selection.autoTranslate || manuallyRequestedFor == identity { await translate() }
        }
        #endif
    }

    #if canImport(Translation) && !os(watchOS)
    private var protectedText: AttributedString {
        var text = AttributedString(original)
        var ranges: [Range<String.Index>] = []
        for term in preservedTerms where !term.isEmpty {
            var start = original.startIndex
            while let range = original.range(of: term, range: start..<original.endIndex) {
                ranges.append(range)
                start = range.upperBound
            }
        }
        let tagger = NLTagger(tagSchemes: [.nameType])
        tagger.string = original
        tagger.enumerateTags(in: original.startIndex..<original.endIndex, unit: .word, scheme: .nameType, options: [.joinNames]) { tag, range in
            if tag == .personalName || tag == .placeName || tag == .organizationName { ranges.append(range) }
            return true
        }
        if let pattern = try? NSRegularExpression(pattern: #"[A-Z]{1,5}-[0-9]+(?:-[0-9]+)*|[\w.+-]+@[\w.-]+|\+?[0-9][0-9\s:.,%-]*"#) {
            for match in pattern.matches(in: original, range: NSRange(original.startIndex..., in: original)) {
                if let range = Range(match.range, in: original) { ranges.append(range) }
            }
        }
        for range in ranges {
            if let start = AttributedString.Index(range.lowerBound, within: text),
               let end = AttributedString.Index(range.upperBound, within: text) {
                text[start..<end].translation.skipsTranslation = true
            }
        }
        return text
    }

    @MainActor private func translate() async {
        guard let sourceLanguage, sourceLanguage != target else { return }
        let source = Locale.Language(identifier: sourceLanguage)
        let destination = Locale.Language(identifier: target)
        guard await LanguageAvailability().status(from: source, to: destination) == .installed else { return }
        do {
            try Task.checkCancellation()
            let session = TranslationSession(installedSource: source, target: destination)
            let response = try await session.translate(protectedText)
            try Task.checkCancellation()
            translation = response.targetText
        } catch { return }
    }
    #endif
}
