import SwiftUI
import SwiftData
import VenioCore
import VenioTheme
import VenioCommercial

@main struct VenioApp: App {
    @State private var themes: ThemeManager
    private let clock = DemoClock()
    private let api: (any VenioAPI)?
    private let initialTab: CommercialTab
    private let initialLeadID: String?

    init() {
        let defaults = UserDefaults.standard
        let manager = ThemeManager()
        let stored = manager.selection
        let theme = defaults.string(forKey: "VenioTheme").flatMap(ThemeKind.init(rawValue:)) ?? stored.theme
        let selection = ThemeSelection(theme: theme,
            background: defaults.string(forKey: "VenioBackground") ?? (theme == stored.theme ? stored.background : theme.backgrounds[0]),
            accent: defaults.string(forKey: "VenioAccent") ?? (theme == stored.theme ? stored.accent : theme.accents[0]),
            locale: defaults.string(forKey: "VenioLocale") ?? stored.locale, autoTranslate: stored.autoTranslate)
        if ["VenioTheme", "VenioBackground", "VenioAccent", "VenioLocale"].contains(where: { defaults.string(forKey: $0) != nil }) {
            manager.select(selection)
        }
        _themes = State(initialValue: manager)
        initialTab = defaults.string(forKey: "VenioTab").flatMap(CommercialTab.init(rawValue:)) ?? .today
        initialLeadID = defaults.string(forKey: "VenioLead")
        do {
            let container = try ModelContainer(for: CachedLead.self, CachedProject.self)
            api = CachedVenioAPI(upstream: MockVenioAPI(clock: clock), container: container)
        } catch { api = nil }
    }

    var body: some Scene {
        WindowGroup {
            ThemeHost(manager: themes) {
                if let api { RootView(api: api, clock: clock, initialTab: initialTab, initialLeadID: initialLeadID) }
                else { StorageUnavailableView() }
            }
            .environment(\.calendar, clock.calendar)
            .environment(\.timeZone, clock.calendar.timeZone)
        }
    }
}

private struct StorageUnavailableView: View {
    @Environment(\.locale) private var locale
    var body: some View {
        let language = locale.language.languageCode?.identifier == "fr" ? "fr" : "en"
        let bundle = Bundle.main.path(forResource: language, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
        ContentUnavailableView(bundle.localizedString(forKey: "Stockage indisponible", value: nil, table: "Localizable"),
                               systemImage: "externaldrive.badge.exclamationmark")
    }
}
