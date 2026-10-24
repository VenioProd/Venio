import SwiftUI
import SwiftData
import VenioCore
import VenioTheme
import VenioCommercial

@main struct VenioApp: App {
    #if os(iOS)
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var watch: WatchBridge
    #else
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    #endif
    @State private var store: CommercialStore?
    @State private var themes: ThemeManager
    private let clock = DemoClock()
    private let monthlyTarget: Decimal
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
        let mock = MockVenioAPI(clock: clock)
        monthlyTarget = mock.monthlyTarget()
        let commercialStore: CommercialStore?
        do {
            let container = try ModelContainer(for: CachedLead.self, CachedProject.self)
            let cached = CachedVenioAPI(upstream: mock, container: container)
            api = cached
            commercialStore = CommercialStore(api: cached, clock: clock, monthlyTarget: monthlyTarget)
        } catch { api = nil; commercialStore = nil }
        _store = State(initialValue: commercialStore)
        #if os(iOS)
        let bridge = WatchBridge()
        bridge.store = commercialStore
        commercialStore?.onLeadOpened = { lead in bridge.publish(lead) }
        bridge.activate()
        _watch = State(initialValue: bridge)
        #endif
    }

    var body: some Scene {
        WindowGroup {
            ThemeHost(manager: themes) {
                if let store {
                    RootView(store: store, initialTab: initialTab, initialLeadID: initialLeadID)
                        .onChange(of: store.hasLoaded, initial: true) { _, loaded in
                            guard loaded, let api else { return }
                            Task { await delegate.push.connected(api: api, store: store, language: themes.locale.language.languageCode?.identifier ?? "fr") }
                        }
                        .onChange(of: themes.locale) { _, locale in
                            guard store.hasLoaded, let api else { return }
                            Task { await delegate.push.connected(api: api, store: store, language: locale.language.languageCode?.identifier ?? "fr") }
                        }
                        .overlay(alignment: .top) {
                            VStack {
                                #if os(iOS)
                                if watch.failed { Text("Transmission Watch impossible", bundle: .main).padding().venioCard() }
                                if !watch.pendingNotes.isEmpty {
                                    Button { Task { await watch.retryPendingNotes() } } label: {
                                        Text("Réessayer les notes Watch (\(watch.pendingNotes.count))", bundle: .main)
                                    }.disabled(watch.retrying).padding().venioCard()
                                }
                                #endif
                            }
                        }
                }
                else { StorageUnavailableView() }
            }
            .onOpenURL { url in Task { await delegate.push.open(type: "", link: url.absoluteString) } }
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
