#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioAdmin
import VenioTheme

public struct RootView: View {
    @Environment(\.locale) private var locale
    @Environment(\.venioSession) private var session
    @State private var store: CommercialStore
    private let initialTab: CommercialTab
    private let initialLeadID: String?
    private let initialAdminSection: AdminSection?
    private let initialAdminItemID: String?

    public init(api: any VenioAPI, clock: DemoClock = DemoClock(), initialTab: CommercialTab = .today, initialLeadID: String? = nil, initialAdminSection: AdminSection? = nil, initialAdminItemID: String? = nil) {
        _store = State(initialValue: CommercialStore(api: api, clock: clock))
        self.initialTab = initialTab
        self.initialLeadID = initialLeadID
        self.initialAdminSection = initialAdminSection
        self.initialAdminItemID = initialAdminItemID
    }
    public init(store: CommercialStore, initialTab: CommercialTab = .today, initialLeadID: String? = nil, initialAdminSection: AdminSection? = nil, initialAdminItemID: String? = nil) {
        _store = State(initialValue: store)
        self.initialTab = initialTab
        self.initialLeadID = initialLeadID
        self.initialAdminSection = initialAdminSection
        self.initialAdminItemID = initialAdminItemID
    }
    public var body: some View {
        Group {
            if store.hasLoaded, let user = store.currentUser {
                switch user.role {
                case .commercial: CommercialSpace(initialTab: initialTab, initialLeadID: initialLeadID)
                case .admin:
                    AdminRootView(user: user, session: session, clock: store.clock,
                        initialSection: initialAdminSection, initialItemID: initialAdminItemID).id(user.id)
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
private struct AdminRootView: View {
    @State private var store: AdminStore
    let initialSection: AdminSection?
    let initialItemID: String?
    init(user: UserSummary, session: SessionModel?, clock: DemoClock, initialSection: AdminSection?, initialItemID: String?) {
        let api: any AdminAPI
        if let session { api = LiveAdminAPI(session: session.api.session) }
        else { api = MockAdminAPI(clock: clock, user: user) }
        _store = State(initialValue: AdminStore(api: api, user: user, clock: clock))
        self.initialSection = initialSection
        self.initialItemID = initialItemID
    }
    var body: some View {
        AdminSpace(initialSection: initialSection, initialItemID: initialItemID) { SettingsView() }
            .environment(store)
            .onDisappear { store.reset() }
    }
}
#endif
