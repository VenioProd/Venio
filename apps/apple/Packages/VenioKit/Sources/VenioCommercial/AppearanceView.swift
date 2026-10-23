#if !os(watchOS)
import SwiftUI
import VenioTheme

public struct AppearanceView: View {
    @Environment(ThemeManager.self) private var manager
    @Environment(\.venioPalette) private var palette

    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Réglages › Apparence").font(.largeTitle.bold())
                if let suggestion = manager.suggestion {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Votre appareil est en mode sombre. Le fond Nuit est disponible.")
                        Button("Choisir Nuit") { manager.select(suggestion) }.venioPrimaryButton()
                    }
                    .venioCard()
                }
                VStack(alignment: .leading, spacing: 16) {
                    Picker("Thème", selection: Binding(get: { manager.selection.theme }, set: selectTheme)) {
                        Text("Liquid glass").tag(ThemeKind.glass)
                        Text("Néon").tag(ThemeKind.neon)
                    }
                    .pickerStyle(.segmented)
                    choices("Fond", keys: manager.selection.theme.backgrounds, selected: manager.selection.background) { key in
                        manager.select(ThemeSelection(theme: manager.selection.theme, background: key, accent: manager.selection.accent))
                    }
                    choices("Accent", keys: manager.selection.theme.accents, selected: manager.selection.accent) { key in
                        manager.select(ThemeSelection(theme: manager.selection.theme, background: manager.selection.background, accent: key))
                    }
                }
                .venioCard()
                VStack(alignment: .leading, spacing: 14) {
                    Text("Aperçu").font(.headline)
                    Text("Maison Calder").font(.title2.bold())
                    Text("Proposition · 14 800 €").foregroundStyle(palette.textSecondary.color)
                    Text("Devis consulté").foregroundStyle(palette.accentText.color)
                    Button("Action principale") {}.venioPrimaryButton().disabled(true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .venioCard()
            }
            .padding()
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .background { ThemedBackground() }
        .navigationTitle("Apparence")
    }

    private func selectTheme(_ theme: ThemeKind) {
        manager.select(ThemeSelection(theme: theme, background: theme.backgrounds[0], accent: theme.accents[0]))
    }

    private func choices(_ title: String, keys: [String], selected: String, action: @escaping (String) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 110))], alignment: .leading) {
                ForEach(keys, id: \.self) { key in
                    Button { action(key) } label: {
                        HStack {
                            Image(systemName: selected == key ? "checkmark.circle.fill" : "circle")
                            Text(label(key))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(palette.base.color.opacity(0.6), in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected == key ? .isSelected : [])
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
