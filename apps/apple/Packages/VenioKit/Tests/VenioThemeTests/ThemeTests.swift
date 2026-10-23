import Foundation
import Synchronization
import Testing
@testable import VenioTheme

@Test func allPaletteContrasts() {
    for theme in ThemeKind.allCases {
        for background in theme.backgrounds {
            for accent in theme.accents {
                let palette = ThemePalette(ThemeSelection(theme: theme, background: background, accent: accent))
                let combination = "\(theme.rawValue)/\(background)/\(accent)"
                #expect(palette.textPrimary.contrast(with: palette.base) >= 4.5, Comment(rawValue: combination))
                #expect(palette.onAccent.contrast(with: palette.accent) >= 4.5, Comment(rawValue: combination))
                #expect(palette.accentText.contrast(with: palette.base) >= 4.5, Comment(rawValue: combination))
            }
        }
    }
}

@Test func urgentRemainsDistinct() {
    let coral = ThemePalette(ThemeSelection(theme: .glass, background: "mist", accent: "coral"))
    let magenta = ThemePalette(ThemeSelection(theme: .neon, background: "black", accent: "magenta"))
    let sky = ThemePalette(.default)
    #expect(coral.urgent != coral.accent)
    #expect(magenta.urgent != magenta.accent)
    #expect(sky.urgent == RGBColor(hex: 0xF97362))
}

@Test func knownContrastRatio() {
    #expect(abs(RGBColor(hex: 0).contrast(with: RGBColor(hex: 0xFFFFFF)) - 21) < 0.000001)
}

@Test func serverSchemaAndNormalization() throws {
    let json = Data(#"{"theme":"glass","background":"night","accent":"sky"}"#.utf8)
    let selection = try JSONDecoder().decode(ThemeSelection.self, from: json)
    let encoded = try JSONEncoder().encode(selection)
    let fields = try #require(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
    #expect(fields["theme"] as? String == "glass")
    #expect(fields["background"] as? String == "night")
    #expect(fields["accent"] as? String == "sky")
    #expect(Set(fields.keys) == Set(["theme", "background", "accent", "locale", "autoTranslate"]))
    #expect(fields["locale"] as? String == "system")
    #expect(fields["autoTranslate"] as? Bool == true)
    #expect(selection.locale == "system")
    #expect(selection.autoTranslate)
    let extended = ThemeSelection(theme: .neon, background: "forest", accent: "acid", locale: "en", autoTranslate: false)
    #expect(try JSONDecoder().decode(ThemeSelection.self, from: JSONEncoder().encode(extended)) == extended)
    let invalid = Data(#"{"theme":"neon","background":"mist","accent":"magenta"}"#.utf8)
    #expect(try JSONDecoder().decode(ThemeSelection.self, from: invalid) == ThemeSelection(theme: .neon, background: "black", accent: "cyan"))
}

@Test @MainActor func managerPersistsExplicitChoice() {
    let store = MemoryThemeStore()
    let manager = ThemeManager(store: store, systemIsDark: true)
    #expect(manager.selection == .default)
    #expect(manager.suggestion?.background == "night")
    #expect(store.load() == nil)
    let chosen = ThemeSelection(theme: .neon, background: "forest", accent: "acid")
    manager.select(chosen)
    #expect(store.load() == chosen)
    let reloaded = ThemeManager(store: store)
    #expect(reloaded.selection == chosen)
    #expect(reloaded.palette == ThemePalette(chosen))
    #expect(reloaded.suggestion == nil)
}

private final class MemoryThemeStore: ThemePreferenceStore {
    let value = Mutex<ThemeSelection?>(nil)
    func load() -> ThemeSelection? { value.withLock { $0 } }
    func save(_ selection: ThemeSelection) { value.withLock { $0 = selection } }
}
