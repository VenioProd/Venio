#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

public struct TodayView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    private let onLead: (String) -> Void
    public init(onLead: @escaping (String) -> Void = { _ in }) { self.onLead = onLead }
    private var formats: CommercialFormats { CommercialFormats(locale: locale) }
    public var body: some View {
        CommercialPage {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(verbatim: formats.dayHeading(store.clock.now)).font(.subheadline)
                    VText("Aujourd’hui").font(.largeTitle.bold())
                }
                Spacer()
                Text(verbatim: store.currentUser?.initials ?? "?").font(.headline).padding()
                    .background(.ultraThinMaterial, in: Circle())
                    .accessibilityLabel(Text(verbatim: store.currentUser?.name ?? ""))
            }
            agendaSection("En retard", leads: store.agenda.overdue, icon: "exclamationmark.triangle", urgent: true) { lead in
                lead.nextActionAt.map { CommercialStrings.format("Relance du %@", locale: locale, formats.date($0)) } ?? ""
            } badge: { _ in CommercialStrings.text("En retard", locale: locale) }
            agendaSection("Relances du jour", leads: store.agenda.followUps, icon: "clock") { lead in
                CommercialStrings.text("Relance", locale: locale) + " · " + lead.contactName
            } badge: { lead in lead.nextActionAt.map(formats.time) ?? "" }
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading(title: "RDV du jour", count: store.agenda.appointments.count)
                ForEach(store.agenda.appointments) { appointment in
                    if let lead = store.leads.first(where: { $0.id == appointment.leadId }) {
                        leadButton(lead, subtitle: CommercialStrings.text("Démo en visio", locale: locale) + " · " + lead.contactName,
                                   badge: formats.time(appointment.startsAt), icon: "video")
                    }
                }
            }
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading(title: "Devis vu, pas signé", count: store.agenda.viewedQuotes.count)
                ForEach(store.agenda.viewedQuotes) { quote in
                    if let lead = store.leads.first(where: { $0.company == quote.client }) {
                        leadButton(lead, subtitle: quote.reference + " · " + (quote.viewedAt.map(formats.timestamp) ?? ""),
                                   badge: CommercialStrings.text("Vu", locale: locale), icon: "eye")
                    }
                }
            }
            agendaSection("Lead chaud sans action", leads: store.agenda.hotWithoutAction, icon: "flame") { lead in
                CommercialStrings.text(lead.leadTemperature.label, locale: locale) + " · " + CommercialStrings.format("Score %lld", locale: locale, lead.score ?? 0)
            } badge: { _ in CommercialStrings.text("Planifier", locale: locale) }
            agendaSection("Nouveau lead entrant", leads: store.agenda.incoming, icon: "person.badge.plus") { lead in
                formats.time(lead.createdAt) + " · " + CommercialStrings.text(lead.source, locale: locale)
            } badge: { _ in CommercialStrings.text("Non assigné", locale: locale) }
        }
        .navigationTitle(CommercialStrings.text("Aujourd’hui", locale: locale))
    }

    private func agendaSection(_ title: String, leads: [Lead], icon: String, urgent: Bool = false,
                               subtitle: @escaping (Lead) -> String, badge: @escaping (Lead) -> String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(title: title, count: leads.count)
            ForEach(leads) { lead in
                leadButton(lead, subtitle: subtitle(lead), badge: badge(lead), icon: icon, urgent: urgent)
            }
        }
    }

    private func leadButton(_ lead: Lead, subtitle: String, badge: String, icon: String, urgent: Bool = false) -> some View {
        Button { onLead(lead.id) } label: {
            LeadRow(lead: lead, subtitle: subtitle, badge: badge, icon: icon, urgent: urgent)
        }.buttonStyle(.plain)
    }
}
#endif
