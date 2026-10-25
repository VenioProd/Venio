#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

public struct RootView: View {
    @Environment(\.locale) private var locale
    @State private var store: CommercialStore
    private let initialTab: CommercialTab
    private let initialLeadID: String?
    private let initialProjectID: String?

    public init(api: any VenioAPI, clock: DemoClock = DemoClock(), initialTab: CommercialTab = .today, initialLeadID: String? = nil, initialProjectID: String? = nil) {
        _store = State(initialValue: CommercialStore(api: api, clock: clock))
        self.initialTab = initialTab
        self.initialLeadID = initialLeadID
        self.initialProjectID = initialProjectID
    }
    public init(store: CommercialStore, initialTab: CommercialTab = .today, initialLeadID: String? = nil, initialProjectID: String? = nil) {
        _store = State(initialValue: store)
        self.initialTab = initialTab
        self.initialLeadID = initialLeadID
        self.initialProjectID = initialProjectID
    }
    public var body: some View {
        Group {
            if store.hasLoaded, let user = store.currentUser {
                switch user.role {
                case .commercial: CommercialSpace(initialTab: initialTab, initialLeadID: initialLeadID, initialProjectID: initialProjectID)
                case .admin: AdminSessionView()
                }
            } else if store.failed {
                VStack(spacing: 16) {
                    ContentUnavailableView(CommercialStrings.text("Données indisponibles", locale: locale), systemImage: "exclamationmark.icloud")
                    if let key = store.errorKey { MobileErrorView(key: key) }
                    Button { Task { await store.load() } } label: { VText("Réessayer") }
                }
            } else { ProgressView { VText("Chargement") } }
        }
        .overlay(alignment: .top) {
            if store.hasLoaded, let key = store.errorKey { MobileErrorView(key: key).padding().venioCard() }
        }
        .environment(store)
        .background { ThemedBackground() }
        .task { await store.load() }
    }
}
private struct AdminSessionView: View {
    @State private var settings = false
    var body: some View {
        NavigationStack {
            AdminPlaceholderView().toolbar {
                ToolbarItem(placement: .primaryAction) { Button { settings = true } label: { VText("Réglages") } }
            }
        }
        .sheet(isPresented: $settings) {
            NavigationStack {
                SettingsView().toolbar { ToolbarItem(placement: .cancellationAction) { Button { settings = false } label: { VText("Fermer") } } }
            }
        }
    }
}
#endif
