#if !os(watchOS)
import SwiftUI
import VenioTheme

public struct AppearanceView: View {
    @Environment(ThemeManager.self) private var manager
    @Environment(\.locale) private var locale
    public init() {}
    public var body: some View {
        CommercialPage {
            if let suggestion = manager.suggestion {
                VStack(alignment: .leading, spacing: 12) {
                    VText("Votre appareil est en mode sombre. Le fond Nuit est disponible.")
                    Button { appearance(theme: suggestion.theme, background: suggestion.background, accent: suggestion.accent) } label: {
                        VText("Choisir Nuit")
                    }.venioPrimaryButton()
                }.venioCard()
            }
            VStack(alignment: .leading, spacing: 18) {
                VText("Thème").font(.headline)
                Picker(CommercialStrings.text("Thème", locale: locale), selection: Binding(get: { manager.selection.theme }, set: { theme in
                    appearance(theme: theme, background: theme.backgrounds[0], accent: theme.accents[0])
                })) {
                    VText("Liquid glass").tag(ThemeKind.glass)
                    VText("Néon").tag(ThemeKind.neon)
                }.pickerStyle(.segmented)
                choices("Fond", keys: manager.selection.theme.backgrounds, selected: manager.selection.background) { key in
                    appearance(theme: manager.selection.theme, background: key, accent: manager.selection.accent)
                }
                choices("Accent", keys: manager.selection.theme.accents, selected: manager.selection.accent) { key in
                    appearance(theme: manager.selection.theme, background: manager.selection.background, accent: key)
                }
            }.venioCard()
            VStack(alignment: .leading, spacing: 14) {
                VText("Aperçu en direct").font(.headline)
                Text(verbatim: "Maison Calder").font(.title2.bold())
                VText("Site vitrine + SEO").font(.subheadline)
                Text(verbatim: CommercialFormats(locale: locale).money(14800)).font(.title2.bold())
                ViewThatFits(in: .horizontal) {
                    HStack { previewBadges }
                    VStack(alignment: .leading) { previewBadges }
                }
                Text(verbatim: CommercialStrings.format("Relance aujourd’hui · %@", locale: locale, "10:30"))
            }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
        }.navigationTitle(CommercialStrings.text("Apparence", locale: locale))
    }
    @ViewBuilder private var previewBadges: some View {
        CommercialBadge(text: CommercialStrings.text("Proposition", locale: locale))
        CommercialBadge(text: CommercialStrings.text("Très chaud", locale: locale), tone: .warning)
        CommercialBadge(text: CommercialStrings.format("Score %lld", locale: locale, 86))
    }
    private func appearance(theme: ThemeKind, background: String, accent: String) {
        manager.select(ThemeSelection(theme: theme, background: background, accent: accent,
                                      locale: manager.selection.locale, autoTranslate: manager.selection.autoTranslate))
    }
    private func choices(_ title: String, keys: [String], selected: String, action: @escaping (String) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            VText(title).font(.headline)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 120))], alignment: .leading) {
                ForEach(keys, id: \.self) { key in
                    Button { action(key) } label: {
                        Label {
                            VText(label(key))
                        } icon: {
                            Image(systemName: selected == key ? "checkmark.circle.fill" : "circle").accessibilityHidden(true)
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(10)
                    }.buttonStyle(.bordered).accessibilityAddTraits(selected == key ? .isSelected : [])
                }
            }
        }
    }
    private func label(_ key: String) -> String {
        switch key {
        case "mist": "Brume"
        case "dawn": "Aurore"
        case "lagoon": "Lagune"
        case "lavender": "Lavande"
        case "night": "Nuit"
        case "black": "Noir"
        case "graphite": "Graphite"
        case "abyss": "Abysse"
        case "plum": "Aubergine"
        case "forest": "Forêt"
        case "sky": "Sky Venio"
        case "cyan": "Cyan Venio"
        case "violet": "Violet"
        case "mint": "Menthe"
        case "coral": "Corail"
        case "amber": "Ambre"
        case "magenta": "Magenta"
        case "acid": "Vert acide"
        case "orange": "Orange"
        default: key
        }
    }
}
#endif
