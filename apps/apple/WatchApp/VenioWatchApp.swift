import SwiftUI
import SwiftData
import VenioCore
import VenioTheme
import VenioCommercial

@main struct VenioWatchApp: App {
    @State private var themes: ThemeManager
    private let api: (any VenioAPI)?
    private let clock = DemoClock()

    init() {
        let manager = ThemeManager()
        let defaults = UserDefaults.standard
        let saved = manager.selection
        let theme = defaults.string(forKey: "VenioTheme").flatMap(ThemeKind.init(rawValue:)) ?? saved.theme
        if ["VenioTheme", "VenioBackground", "VenioAccent", "VenioLocale"].contains(where: { defaults.string(forKey: $0) != nil }) {
            manager.select(ThemeSelection(theme: theme,
                background: defaults.string(forKey: "VenioBackground") ?? (theme == saved.theme ? saved.background : theme.backgrounds[0]),
                accent: defaults.string(forKey: "VenioAccent") ?? (theme == saved.theme ? saved.accent : theme.accents[0]),
                locale: defaults.string(forKey: "VenioLocale") ?? saved.locale, autoTranslate: saved.autoTranslate))
        }
        _themes = State(initialValue: manager)
        do {
            let container = try ModelContainer(for: CachedLead.self, CachedProject.self)
            api = CachedVenioAPI(upstream: MockVenioAPI(clock: clock), container: container)
        } catch { api = nil }
    }
    var body: some Scene {
        WindowGroup {
            ThemeHost(manager: themes) {
                if let api { FollowUpsView(api: api, clock: clock) }
                else { Text("Stockage indisponible", bundle: .main) }
            }
        }
    }
}
