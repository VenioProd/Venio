import SwiftUI
import VenioCore
import VenioTheme

public struct FollowUpsView: View {
    @Environment(\.locale) private var locale
    @State private var store: CommercialStore
    public init(api: any VenioAPI, clock: DemoClock = DemoClock()) {
        _store = State(initialValue: CommercialStore(api: api, clock: clock))
    }
    public var body: some View {
        NavigationStack {
            List {
                if store.hasLoaded {
                    Section { ForEach(store.agenda.overdue) { row($0, overdue: true) } } header: { VText("En retard") }
                    Section { ForEach(store.agenda.followUps) { row($0, overdue: false) } } header: { VText("Aujourd’hui") }
                    if store.agenda.overdue.isEmpty && store.agenda.followUps.isEmpty { VText("Aucune relance aujourd’hui") }
                } else if store.failed {
                    VText("Relances indisponibles")
                    Button { Task { await store.load() } } label: { VText("Réessayer") }
                } else { ProgressView { VText("Chargement") } }
            }
            .navigationDestination(for: String.self) { id in WatchLeadDetailView(id: id) }
            .scrollContentBackground(.hidden)
            .background { ThemedBackground() }
            .navigationTitle(CommercialStrings.text("Relances", locale: locale))
        }
        .environment(store)
        .task { await store.load() }
    }
    private func row(_ lead: Lead, overdue: Bool) -> some View {
        NavigationLink(value: lead.id) {
            VStack(alignment: .leading, spacing: 6) {
                Text(verbatim: lead.company).font(.headline)
                if let date = lead.nextActionAt {
                    let formats = CommercialFormats(locale: locale)
                    CommercialBadge(text: overdue ? CommercialStrings.text("En retard", locale: locale) + " · " + formats.date(date) : formats.time(date),
                                    tone: overdue ? .urgent : .accent)
                }
            }
        }.listRowBackground(Color.clear)
    }
}

public struct WatchLeadDetailView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.openURL) private var openURL
    let id: String
    public init(id: String) { self.id = id }
    public var body: some View {
        ScrollView {
            if let lead = store.leads.first(where: { $0.id == id }) {
                VStack(alignment: .leading, spacing: 14) {
                    Text(verbatim: lead.company).font(.headline)
                    Text(verbatim: lead.contactName).font(.subheadline)
                    CommercialBadge(text: CommercialStrings.format("Score %lld", locale: locale, lead.score ?? 0))
                    Button {
                        if let url = lead.phoneURL { openURL(url) }
                    } label: {
                        Label { VText("Appeler") } icon: { Image(systemName: "phone.fill").accessibilityHidden(true) }
                    }.venioPrimaryButton().disabled(lead.phoneURL == nil)
                }.padding()
            } else { VText("Lead indisponible") }
        }.background { ThemedBackground() }
    }
}
