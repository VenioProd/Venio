#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

public struct RootView: View {
    @Environment(\.locale) private var locale
    @State private var store: CommercialStore
    private let initialTab: CommercialTab
    private let initialLeadID: String?

    public init(api: any VenioAPI, clock: DemoClock = DemoClock(), initialTab: CommercialTab = .today, initialLeadID: String? = nil) {
        _store = State(initialValue: CommercialStore(api: api, clock: clock))
        self.initialTab = initialTab
        self.initialLeadID = initialLeadID
    }
    public var body: some View {
        Group {
            if store.hasLoaded, let user = store.currentUser {
                switch user.role {
                case .commercial: CommercialSpace(initialTab: initialTab, initialLeadID: initialLeadID)
                case .admin: AdminPlaceholderView()
                }
            } else if store.failed {
                VStack(spacing: 16) {
                    ContentUnavailableView(CommercialStrings.text("Données indisponibles", locale: locale), systemImage: "exclamationmark.icloud")
                    Button { Task { await store.load() } } label: { VText("Réessayer") }
                }
            } else { ProgressView { VText("Chargement") } }
        }
        .environment(store)
        .background { ThemedBackground() }
        .task { await store.load() }
    }
}
#endif
