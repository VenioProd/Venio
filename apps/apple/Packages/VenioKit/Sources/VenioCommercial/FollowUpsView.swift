import SwiftUI
import VenioCore
import VenioTheme

public struct FollowUpsView: View {
    private let api: any VenioAPI
    private let clock: DemoClock
    @State private var agenda: TodayAgenda?
    @State private var failed = false
    @Environment(\.venioPalette) private var palette

    public init(api: any VenioAPI, clock: DemoClock) {
        self.api = api
        self.clock = clock
    }

    public var body: some View {
        NavigationStack {
            List {
                if let agenda {
                    Section("En retard") {
                        ForEach(agenda.overdue) { lead in row(lead, overdue: true) }
                    }
                    Section("Aujourd’hui") {
                        ForEach(agenda.followUps) { lead in row(lead, overdue: false) }
                    }
                    if agenda.overdue.isEmpty && agenda.followUps.isEmpty {
                        Text("Aucune relance aujourd’hui")
                    }
                } else if failed {
                    Text("Relances indisponibles")
                } else {
                    ProgressView("Chargement")
                }
            }
            .scrollContentBackground(.hidden)
            .background { ThemedBackground() }
            .navigationTitle("Relances")
        }
        .task {
            do {
                let user = try await api.currentUser()
                async let leads = api.leads()
                async let quotes = api.quotes()
                async let appointments = api.appointments()
                agenda = try await TodayAgenda(leads: leads, quotes: quotes, appointments: appointments, now: clock.now, calendar: clock.calendar, userId: user.id)
            } catch { failed = true }
        }
        .environment(\.calendar, clock.calendar)
        .environment(\.timeZone, clock.calendar.timeZone)
    }

    private func row(_ lead: Lead, overdue: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(lead.company).font(.headline)
            if let date = lead.nextActionAt {
                if overdue {
                    Text(date, format: .dateTime.day().month()).foregroundStyle(palette.urgent.color)
                } else {
                    Text(date, format: .dateTime.hour().minute()).foregroundStyle(palette.accentText.color)
                }
            }
        }
        .foregroundStyle(palette.textPrimary.color)
        .listRowBackground(palette.base.color.opacity(0.85))
    }
}
