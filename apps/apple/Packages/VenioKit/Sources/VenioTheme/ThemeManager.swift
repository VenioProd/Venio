import Foundation
import Observation

public protocol ThemePreferenceStore: Sendable {
    func load() -> ThemeSelection?
    func save(_ selection: ThemeSelection)
}

public struct UserDefaultsThemeStore: ThemePreferenceStore {
    private let key: String

    public init(key: String = "venio.appearance") { self.key = key }

    public func load() -> ThemeSelection? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(ThemeSelection.self, from: data)
    }

    public func save(_ selection: ThemeSelection) {
        guard let data = try? JSONEncoder().encode(selection) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}

@Observable @MainActor public final class ThemeManager {
    public private(set) var selection: ThemeSelection
    public var preferredIsDark: Bool? { hasPreference ? palette.isDark : nil }
    public var locale: Locale {
        if selection.locale == "system" {
            let language = Locale.preferredLanguages.first ?? "fr"
            return Locale(identifier: language.hasPrefix("fr") ? "fr_FR" : "en_US")
        }
        return Locale(identifier: selection.locale == "fr" ? "fr_FR" : "en_US")
    }
    public var palette: ThemePalette { ThemePalette(selection) }
    public private(set) var suggestion: ThemeSelection?
    private var hasPreference: Bool
    private let store: any ThemePreferenceStore

    public init(store: any ThemePreferenceStore = UserDefaultsThemeStore(), systemIsDark: Bool = false) {
        self.store = store
        let stored = store.load()
        selection = stored ?? .default
        hasPreference = stored != nil
        proposeDarkAppearance(systemIsDark)
    }

    public func proposeDarkAppearance(_ isDark: Bool) {
        guard !hasPreference else { return }
        suggestion = isDark ? ThemeSelection(theme: .glass, background: "night", accent: "sky") : nil
    }

    public func select(_ selection: ThemeSelection) {
        self.selection = selection
        hasPreference = true
        suggestion = nil
        store.save(selection)
    }
}
