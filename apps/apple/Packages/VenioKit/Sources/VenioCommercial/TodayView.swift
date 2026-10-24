#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

public struct TodayView: View {
    @State private var showingSettings = false
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
    #endif
    private var columns: [GridItem] {
        #if os(iOS)
        let count = sizeClass == .regular ? 2 : 1
        #else
        let count = 2
        #endif
        return Array(repeating: GridItem(.flexible(), alignment: .top), count: count)
    }
    private let onLead: (String) -> Void
    public init(onLead: @escaping (String) -> Void = { _ in }) { self.onLead = onLead }
    private var meetings: [Appointment] { store.appointments.filter { $0.assignedTo == store.currentUser?.id } }
    private var formats: CommercialFormats { CommercialFormats(locale: locale) }
    public var body: some View {
        CommercialPage {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(verbatim: formats.dayHeading(store.clock.now)).font(.subheadline)
                    VText("Aujourd’hui").font(.largeTitle.bold())
                }
                Spacer()
                Button { showingSettings = true } label: {
                    VStack(spacing: 4) {
                        Text(verbatim: store.currentUser?.initials ?? "?").font(.headline)
                        VText("Réglages").font(.caption)
                    }.padding().background(.ultraThinMaterial, in: Capsule())
                }.buttonStyle(.plain)
            }
            if store.currentUser?.permissions.contains("view_crm") == true {
                LazyVGrid(columns: columns, alignment: .leading, spacing: 22) {
                    agendaSection("En retard", leads: store.agenda.overdue, icon: "exclamationmark.triangle", urgent: true) { lead in
                        lead.nextActionAt.map { CommercialStrings.format("Relance du %@", locale: locale, formats.date($0)) } ?? ""
                    } badge: { _ in CommercialStrings.text("En retard", locale: locale) }
                    agendaSection("Relances du jour", leads: store.agenda.followUps, icon: "clock") { lead in
                        CommercialStrings.text("Relance", locale: locale) + " · " + lead.contactName
                    } badge: { lead in lead.nextActionAt.map(formats.time) ?? "" }
                    if !meetings.isEmpty { VStack(alignment: .leading, spacing: 10) {
                        SectionHeading(title: "RDV du jour", count: meetings.count)
                        VStack(spacing: 0) {
                            ForEach(meetings) { appointment in
                                if let lead = store.leads.first(where: { $0.id == appointment.leadId }) {
                                    leadButton(lead, subtitle: CommercialStrings.text("Démo en visio", locale: locale) + " · " + lead.contactName,
                                               badge: formats.time(appointment.startsAt), icon: "video")
                                    if appointment.id != meetings.last?.id { Divider() }
                                } else {
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(verbatim: appointment.title).font(.headline)
                                        Text(verbatim: appointment.location).font(.caption)
                                    }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 10)
                                }
                            }
                        }.venioCard()
                    } }
                    if !store.agenda.viewedQuotes.isEmpty { VStack(alignment: .leading, spacing: 10) {
                        SectionHeading(title: "Devis vu, pas signé", count: store.agenda.viewedQuotes.count)
                        VStack(spacing: 0) {
                            ForEach(store.agenda.viewedQuotes) { quote in
                                if let lead = store.leads.first(where: { $0.company == quote.client }) {
                                    leadButton(lead, subtitle: (quote.reference ?? quote.title) + " · " + (quote.firstViewedAt.map(formats.timestamp) ?? ""),
                                               badge: CommercialStrings.text("Vu", locale: locale), icon: "eye")
                                } else {
                                    // En live, un devis ne porte que le compte client : pas de lead à ouvrir.
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(verbatim: quote.title).font(.headline)
                                        Text(verbatim: quote.firstViewedAt.map(formats.timestamp) ?? "").font(.caption)
                                    }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 10)
                                }
                                if quote.id != store.agenda.viewedQuotes.last?.id { Divider() }
                            }
                        }.venioCard()
                    } }
                    agendaSection("Lead chaud sans action", leads: store.agenda.hotWithoutAction, icon: "flame") { lead in
                        CommercialStrings.text(lead.leadTemperature.label, locale: locale) + " · " + CommercialStrings.format("Score %lld", locale: locale, lead.score ?? 0)
                    } badge: { _ in CommercialStrings.text("Planifier", locale: locale) }
                    agendaSection("Nouveau lead entrant", leads: store.agenda.incoming, icon: "person.badge.plus") { lead in
                        formats.time(lead.createdAt) + " · " + CommercialStrings.text(lead.source, locale: locale)
                    } badge: { _ in CommercialStrings.text("Non assigné", locale: locale) }
                }
            }
        }
        .sheet(isPresented: $showingSettings) {
            NavigationStack {
                SettingsView().toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button { showingSettings = false } label: { VText("Fermer") }
                    }
                }
            }
        }
        .navigationTitle("")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    @ViewBuilder private func agendaSection(_ title: String, leads: [Lead], icon: String, urgent: Bool = false,
                               subtitle: @escaping (Lead) -> String, badge: @escaping (Lead) -> String) -> some View {
        if !leads.isEmpty { VStack(alignment: .leading, spacing: 10) {
            SectionHeading(title: title, count: leads.count)
            VStack(spacing: 0) {
                ForEach(leads) { lead in
                    leadButton(lead, subtitle: subtitle(lead), badge: badge(lead), icon: icon, urgent: urgent)
                    if lead.id != leads.last?.id { Divider() }
                }
            }.venioCard()
        } }
    }

    private func leadButton(_ lead: Lead, subtitle: String, badge: String, icon: String, urgent: Bool = false) -> some View {
        Button { onLead(lead.id) } label: {
            LeadRow(lead: lead, subtitle: subtitle, badge: badge, icon: icon, urgent: urgent)
        }.buttonStyle(.plain)
    }
}
#endif
