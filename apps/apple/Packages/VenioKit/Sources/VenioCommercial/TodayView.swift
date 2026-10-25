#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

public struct TodayView: View {
    @State private var showingSettings = false
    @Environment(CommercialStore.self) private var store
    @Environment(\.venioSession) private var session
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
    #endif
    private var compact: Bool {
        #if os(iOS)
        sizeClass != .regular
        #else
        false
        #endif
    }
    private let onLead: (String) -> Void
    public init(onLead: @escaping (String) -> Void = { _ in }) { self.onLead = onLead }
    private var agenda: TodayAgenda { store.agenda }
    private var formats: CommercialFormats { CommercialFormats(locale: locale) }
    public var body: some View {
        CommercialPage {
            header
            if store.currentUser?.permissions.contains("view_crm") == true {
                if compact { compactAgenda }
                else { wideAgenda }
            }
        }
        .commercialRefreshable()
        .animation(.smooth, value: agenda.overdue.map(\.id))
        .animation(.smooth, value: agenda.followUps.map(\.id))
        .animation(.smooth, value: agenda.hotWithoutAction.map(\.id))
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
    private var header: some View {
        HStack(alignment: compact ? .top : .center, spacing: 16) {
            if compact {
                VStack(alignment: .leading, spacing: 6) {
                    Text(verbatim: formats.dayHeading(store.clock.now)).font(.subheadline)
                    VText("Aujourd’hui").font(.largeTitle.bold())
                    syncStatus
                }
            } else {
                VText("Aujourd’hui").font(.title2.bold()).fixedSize()
                Text(verbatim: formats.dayHeading(store.clock.now)).font(.subheadline)
                    .foregroundStyle(palette.textSecondary.color).lineLimit(1).minimumScaleFactor(0.75)
                syncStatus.lineLimit(1)
            }
            Spacer(minLength: 0)
            Button { store.showingSearch = true } label: {
                Label { VText("Rechercher") } icon: { Image(systemName: "magnifyingglass") }
                    .labelStyle(.iconOnly).frame(width: 40, height: 40)
            }.buttonStyle(.plain).accessibilityIdentifier("today.search")
            Button { showingSettings = true } label: {
                if compact {
                    VStack(spacing: 4) {
                        Text(verbatim: store.currentUser?.initials ?? "?").font(.headline)
                        VText("Réglages").font(.caption)
                    }.padding(16).background(.ultraThinMaterial, in: Capsule())
                } else {
                    Text(verbatim: store.currentUser?.initials ?? "?").font(.subheadline.weight(.semibold))
                        .frame(width: 40, height: 40)
                }
            }.buttonStyle(.plain).accessibilityLabel(CommercialStrings.text("Réglages", locale: locale))
            if !compact { QuickEntryButton() }
        }
    }
    @ViewBuilder private var syncStatus: some View {
        if let session, session.offline || !session.pending.isEmpty { OutboxStatusView() }
        else { SyncStatusView() }
    }
    private var wideAgenda: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack(spacing: 16) {
                metric("En retard", count: agenda.overdue.count, icon: "exclamationmark.triangle", urgent: true)
                metric("Relances du jour", count: agenda.followUps.count, icon: "clock")
                metric("RDV", count: agenda.appointments.count, icon: "calendar")
                metric("Nouveaux leads", count: agenda.incoming.count, icon: "person.badge.plus")
            }
            HStack(alignment: .top, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    SectionHeading(title: "À faire maintenant", count: agenda.overdue.count + agenda.followUps.count)
                    VStack(spacing: 0) {
                        let leads = agenda.overdue + agenda.followUps
                        if leads.isEmpty { empty("Aucune relance à traiter") }
                        ForEach(leads) { lead in
                            let overdue = agenda.overdue.contains { $0.id == lead.id }
                            leadButton(lead, subtitle: lead.contactName,
                                badge: overdue ? CommercialStrings.text("En retard", locale: locale) : lead.nextActionAt.map(formats.time) ?? "",
                                icon: overdue ? "exclamationmark.triangle" : "clock", urgent: overdue)
                            if lead.id != leads.last?.id { Divider() }
                        }
                    }.venioCard()
                }.frame(maxWidth: .infinity, alignment: .topLeading)
                VStack(alignment: .leading, spacing: 8) {
                    SectionHeading(title: "Agenda", count: agenda.appointments.count)
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(spacing: 0) {
                            if agenda.appointments.isEmpty { empty("Aucun rendez-vous aujourd’hui") }
                            appointmentRows
                        }
                        Divider()
                        SectionHeading(title: "À débloquer", count: agenda.viewedQuotes.count + agenda.hotWithoutAction.count + agenda.incoming.count)
                        if agenda.viewedQuotes.isEmpty && agenda.hotWithoutAction.isEmpty && agenda.incoming.isEmpty {
                            empty("Rien à débloquer")
                        }
                        if !agenda.viewedQuotes.isEmpty {
                            VStack(spacing: 0) {
                                SectionHeading(title: "Devis vu, pas signé", count: agenda.viewedQuotes.count)
                                quoteRows
                            }
                        }
                        unblockLeads("Lead chaud sans action", leads: agenda.hotWithoutAction, icon: "flame", badge: "Planifier")
                        unblockLeads("Nouveau lead entrant", leads: agenda.incoming, icon: "person.badge.plus", badge: "Non assigné")
                    }.venioCard()
                }.frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
    }
    private func metric(_ title: String, count: Int, icon: String, urgent: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: icon).foregroundStyle(urgent ? palette.urgent.color : palette.accentText.color)
                VText(title).foregroundStyle(palette.textSecondary.color)
            }.font(.subheadline).lineLimit(1).minimumScaleFactor(0.8)
            Text(verbatim: formats.number(count)).font(.title.bold().monospacedDigit())
                .contentTransition(.numericText())
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
            .accessibilityElement(children: .combine)
    }
    private func empty(_ title: String) -> some View {
        VText(title).font(.subheadline).foregroundStyle(palette.textSecondary.color)
            .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
    }
    @ViewBuilder private func unblockLeads(_ title: String, leads: [Lead], icon: String, badge: String) -> some View {
        if !leads.isEmpty {
            VStack(spacing: 0) {
                SectionHeading(title: title, count: leads.count)
                ForEach(leads) { lead in
                    leadButton(lead, subtitle: lead.contactName, badge: CommercialStrings.text(badge, locale: locale), icon: icon)
                    if lead.id != leads.last?.id { Divider() }
                }
            }
        }
    }
    private var compactAgenda: some View {
        VStack(alignment: .leading, spacing: 24) {
            agendaSection("En retard", leads: agenda.overdue, icon: "exclamationmark.triangle", urgent: true) { lead in
                lead.nextActionAt.map { formats.followUp($0, clock: store.clock) } ?? ""
            } badge: { _ in CommercialStrings.text("En retard", locale: locale) }
            agendaSection("Relances du jour", leads: agenda.followUps, icon: "clock") { lead in
                CommercialStrings.text("Relance", locale: locale) + " · " + lead.contactName
            } badge: { lead in lead.nextActionAt.map(formats.time) ?? "" }
            if !agenda.appointments.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SectionHeading(title: "RDV du jour", count: agenda.appointments.count)
                    VStack(spacing: 0) { appointmentRows }.venioCard()
                }
            }
            if !agenda.viewedQuotes.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SectionHeading(title: "Devis vu, pas signé", count: agenda.viewedQuotes.count)
                    VStack(spacing: 0) { quoteRows }.venioCard()
                }
            }
            agendaSection("Lead chaud sans action", leads: agenda.hotWithoutAction, icon: "flame") { lead in
                CommercialStrings.text(lead.leadTemperature.label, locale: locale) + " · " + CommercialStrings.format("Score %lld", locale: locale, lead.score ?? 0)
            } badge: { _ in CommercialStrings.text("Planifier", locale: locale) }
            agendaSection("Nouveau lead entrant", leads: agenda.incoming, icon: "person.badge.plus") { lead in
                formats.time(lead.createdAt) + " · " + CommercialStrings.text(lead.source, locale: locale)
            } badge: { _ in CommercialStrings.text("Non assigné", locale: locale) }
        }
    }
    private var appointmentRows: some View {
        ForEach(agenda.appointments) { appointment in
            Button {
                if let leadId = appointment.leadId { onLead(leadId) }
                else if let projectId = appointment.projectId { Task { await store.open(.project(projectId)) } }
            } label: {
                HStack(spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(verbatim: appointment.title).font(compact ? .headline : .subheadline.weight(.semibold))
                        Text(verbatim: appointment.leadCompany ?? appointment.projectName ?? appointment.location)
                            .font(.caption).foregroundStyle(palette.textSecondary.color)
                    }
                    Spacer(minLength: 0)
                    Text(verbatim: formats.time(appointment.startsAt) + (appointment.endsAt.map { " – " + formats.time($0) } ?? ""))
                        .font(.subheadline.monospacedDigit()).fixedSize()
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
            }.buttonStyle(.plain).disabled(appointment.leadId == nil && appointment.projectId == nil)
            if appointment.id != agenda.appointments.last?.id { Divider() }
        }
    }
    private var quoteRows: some View {
        ForEach(agenda.viewedQuotes) { quote in
            if let leadId = quote.leadId, let lead = store.leads.first(where: { $0.id == leadId }) {
                leadButton(lead, subtitle: (quote.reference ?? quote.title) + " · " + (quote.firstViewedAt.map(formats.timestamp) ?? ""),
                           badge: CommercialStrings.text("Vu", locale: locale), icon: "eye")
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text(verbatim: quote.reference ?? quote.title).font(compact ? .headline : .subheadline.weight(.semibold))
                    Text(verbatim: quote.firstViewedAt.map(formats.timestamp) ?? "").font(.caption)
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
            }
            if quote.id != agenda.viewedQuotes.last?.id { Divider() }
        }
    }
    @ViewBuilder private func agendaSection(_ title: String, leads: [Lead], icon: String, urgent: Bool = false,
                               subtitle: @escaping (Lead) -> String, badge: @escaping (Lead) -> String) -> some View {
        if !leads.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading(title: title, count: leads.count)
                VStack(spacing: 0) {
                    ForEach(leads) { lead in
                        leadButton(lead, subtitle: subtitle(lead), badge: badge(lead), icon: icon, urgent: urgent)
                        if lead.id != leads.last?.id { Divider() }
                    }
                }.venioCard()
            }
        }
    }
    private func leadButton(_ lead: Lead, subtitle: String, badge: String, icon: String, urgent: Bool = false) -> some View {
        Button { onLead(lead.id) } label: {
            LeadRow(lead: lead, subtitle: subtitle, badge: badge, icon: icon, urgent: urgent, dense: !compact)
        }.buttonStyle(.plain)
            .leadInteractions(lead, swipe: true) { onLead(lead.id) }
    }
}
#endif
