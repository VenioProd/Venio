import Foundation
import Testing
import SwiftData
@testable import VenioCore

@Test func pipelineSummary() async throws {
    let leads = try await MockVenioAPI().leads()
    let all = PipelineSummary(leads: leads, scope: .all)
    #expect(all.count == 8)
    #expect(all.amount == 152500)
    #expect(all.weighted == 65370)
    let expected: [(LeadStage, Int, Decimal, Decimal)] = [
        (.lead, 1, 38000, 3800), (.qualified, 1, 6400, 1600),
        (.contacted, 2, 21600, 7560), (.demo, 2, 40700, 20350), (.proposal, 2, 45800, 32060)
    ]
    #expect(all.stages.count == expected.count)
    for (stage, count, amount, weighted) in expected {
        let actual = try #require(all.stages.first { $0.id == stage })
        #expect(actual.count == count)
        #expect(actual.amount == amount)
        #expect(actual.weighted == weighted)
    }
    let mine = PipelineSummary(leads: leads, scope: .mine(MockVenioAPI.lea.id))
    #expect(mine.count == 5)
    #expect(mine.amount == 71500)
    var closed = leads[0]
    closed.status = .won
    #expect(PipelineSummary(leads: [closed], scope: .all).count == 0)
    closed.status = .lost
    #expect(PipelineSummary(leads: [closed], scope: .all).amount == 0)
}

@Test func todayAgenda() async throws {
    let api = MockVenioAPI()
    let agenda = try await TodayAgenda(leads: api.leads(), quotes: api.quotes(), appointments: api.appointments(), now: api.clock.now, calendar: api.clock.calendar, userId: MockVenioAPI.lea.id)
    #expect(agenda.overdue.map(\.id) == ["lead-ferrand"])
    #expect(agenda.followUps.map(\.id) == ["lead-calder", "lead-arcadie"])
    #expect(agenda.followUps.map(\.nextActionAt) == [DemoClock.date(23, hour: 10, minute: 30), DemoClock.date(23, hour: 16)])
    #expect(agenda.appointments.map(\.leadId) == ["lead-nova"])
    #expect(agenda.appointments.first?.startsAt == DemoClock.date(23, hour: 14))
    #expect(agenda.hotWithoutAction.map(\.id) == ["lead-halles"])
    #expect(agenda.incoming.map(\.id) == ["lead-okami"])
    #expect(agenda.viewedQuotes.map(\.reference) == ["DV-2026-041"])
}

@Test func cacheFallsBackAfterSuccess() async throws {
    let container = try ModelContainer(for: CachedLead.self, CachedProject.self, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    let source = FailingAPI()
    let api = CachedVenioAPI(upstream: source, container: container)
    let fresh = try await api.leads()
    #expect(fresh.count == 8)
    await source.goOffline()
    let cached = try await api.leads()
    #expect(Set(cached.map(\.id)) == Set(fresh.map(\.id)))
    #expect(PipelineSummary(leads: cached, scope: .all).amount == 152500)
}

private actor FailingAPI: VenioAPI {
    var offline = false
    let mock = MockVenioAPI()
    func goOffline() { offline = true }
    func leads() async throws -> [Lead] {
        if offline { throw Failure.offline }
        return try await mock.leads()
    }
    func currentUser() async throws -> UserSummary { try await mock.currentUser() }
    func lead(id: String) async throws -> Lead { try await mock.lead(id: id) }
    func timeline(leadId: String) async throws -> [TimelineEntry] { try await mock.timeline(leadId: leadId) }
    func quotes() async throws -> [QuoteProposal] { try await mock.quotes() }
    func appointments() async throws -> [Appointment] { try await mock.appointments() }
    func projects() async throws -> [Project] { try await mock.projects() }
    func project(id: String) async throws -> ProjectDetail { try await mock.project(id: id) }
    enum Failure: Error { case offline }
}
