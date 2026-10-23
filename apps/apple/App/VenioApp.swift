import SwiftUI
import SwiftData
import VenioCore
import VenioTheme
import VenioCommercial

@main struct VenioApp: App {
    @State private var themes = ThemeManager()
    private let clock = DemoClock()
    private let api: (any VenioAPI)?

    init() {
        do {
            let container = try ModelContainer(for: CachedLead.self, CachedProject.self)
            api = CachedVenioAPI(upstream: MockVenioAPI(clock: clock), container: container)
        } catch {
            api = nil
        }
    }

    var body: some Scene {
        WindowGroup {
            ThemeHost(manager: themes) {
                if let api {
                    RootView(api: api)
                } else {
                    ContentUnavailableView("Stockage indisponible", systemImage: "externaldrive.badge.exclamationmark")
                }
            }
            .environment(\.locale, Locale(identifier: "fr_FR"))
            .environment(\.calendar, clock.calendar)
            .environment(\.timeZone, clock.calendar.timeZone)
        }
    }
}
