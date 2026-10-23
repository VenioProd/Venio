#if !os(watchOS)
import SwiftUI
import VenioTheme

public struct SettingsView: View {
    @Environment(\.locale) private var locale
    public init() {}
    public var body: some View {
        List {
            NavigationLink { AppearanceView() } label: {
                Label { VText("Apparence") } icon: { Image(systemName: "paintpalette").accessibilityHidden(true) }
            }
            NavigationLink { LanguageView() } label: {
                Label { VText("Langue") } icon: { Image(systemName: "globe").accessibilityHidden(true) }
            }
        }
        .scrollContentBackground(.hidden)
        .background { ThemedBackground() }
        .navigationTitle(CommercialStrings.text("Réglages", locale: locale))
    }
}

public struct LanguageView: View {
    @Environment(ThemeManager.self) private var preferences
    @Environment(\.locale) private var locale
    public init() {}
    public var body: some View {
        CommercialPage {
            VStack(alignment: .leading, spacing: 20) {
                Picker(CommercialStrings.text("Langue de l’interface", locale: locale), selection: Binding(get: {
                    preferences.selection.locale
                }, set: { update(locale: $0, autoTranslate: preferences.selection.autoTranslate) })) {
                    VText("Système").tag("system")
                    VText("Français").tag("fr")
                    VText("English").tag("en")
                }.pickerStyle(.inline)
                Toggle(isOn: Binding(get: { preferences.selection.autoTranslate }, set: {
                    update(locale: preferences.selection.locale, autoTranslate: $0)
                })) { VText("Traduire automatiquement") }
                VText("Les notes, messages et mises à jour écrits dans l’autre langue s’affichent traduits. La traduction se fait sur l’appareil.").font(.subheadline)
            }.venioCard()
            VStack(alignment: .leading, spacing: 12) {
                VText("Aperçu en direct").font(.headline)
                TranslatableText("The client would like to review the proposal next week.")
            }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
        }.navigationTitle(CommercialStrings.text("Langue", locale: locale))
    }
    private func update(locale: String, autoTranslate: Bool) {
        let selection = preferences.selection
        preferences.select(ThemeSelection(theme: selection.theme, background: selection.background, accent: selection.accent,
                                          locale: locale, autoTranslate: autoTranslate))
    }
}
#endif
