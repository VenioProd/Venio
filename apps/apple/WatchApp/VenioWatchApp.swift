import SwiftUI
import VenioCore
import VenioTheme
import VenioCommercial

@main struct VenioWatchApp: App {
    @State private var themes = ThemeManager()
    private let clock = DemoClock()

    var body: some Scene {
        WindowGroup {
            ThemeHost(manager: themes) {
                FollowUpsView(api: MockVenioAPI(clock: clock), clock: clock)
            }
            .environment(\.locale, Locale(identifier: "fr_FR"))
        }
    }
}
