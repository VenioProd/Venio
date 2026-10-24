import SwiftUI
import UserNotifications
import VenioCore
import VenioTheme
import VenioCommercial

@main struct VenioWatchApp: App {
    @State private var bridge = WatchBridge()
    @State private var themes: ThemeManager
    private let demo = MockVenioAPI()
    private let defaultLive: Bool
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
        UNUserNotificationCenter.current().setNotificationCategories([
            UNNotificationCategory(identifier: "QUOTE_PROPOSAL_VIEWED", actions: [], intentIdentifiers: [])
        ])
        defaultLive = (try? BackendConfiguration().backend) != .mock

    }
    var body: some Scene {
        WindowGroup {
            ThemeHost(manager: themes) {
                Group {
                    if bridge.liveBackend ?? defaultLive { WatchLiveFollowUps(bridge: bridge) }
                    else { FollowUpsView(api: demo, clock: clock) }
                }
                .safeAreaInset(edge: .bottom) { WatchFieldTools(bridge: bridge) }
                .task { bridge.activate() }
            }
        }
        WKNotificationScene(controller: QuoteNotificationController.self, category: "QUOTE_PROPOSAL_VIEWED")
    }
}

private struct WatchLiveFollowUps: View {
    let bridge: WatchBridge
    var body: some View {
        NavigationStack {
            List {
                if bridge.followUps.isEmpty { Text("Aucune relance aujourd’hui", bundle: .main) }
                ForEach(bridge.followUps) { lead in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(verbatim: lead.company).font(.headline)
                        Text(verbatim: lead.contact).font(.caption)
                        Text(lead.date, style: .date).font(.caption)
                        if let phone = URL(string: "tel:" + lead.phone.filter { $0.isNumber || $0 == "+" }), !lead.phone.isEmpty {
                            Link(destination: phone) { Text("Appeler", bundle: .main) }
                        }
                    }
                }
            }
            .navigationTitle(Text("Relances", bundle: .main))
        }
    }
}
