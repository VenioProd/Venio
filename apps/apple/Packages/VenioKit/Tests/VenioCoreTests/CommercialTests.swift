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
    #expect(fresh.filter { $0.status.isOpen }.count == 8)
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
    func quoteTemplates() async throws -> [QuoteTemplate] { try await mock.quoteTemplates() }
    func createQuote(templateId: String, projectId: String, title: String?) async throws -> QuoteProposal {
        try await mock.createQuote(templateId: templateId, projectId: projectId, title: title)
    }
    func sendQuote(id: String) async throws -> QuoteProposal { try await mock.sendQuote(id: id) }
    func createInteraction(_ draft: InteractionDraft) async throws -> TimelineEntry { try await mock.createInteraction(draft) }
    func updateLead(id: String, patch: LeadPatch) async throws -> Lead { try await mock.updateLead(id: id, patch: patch) }
    func createLead(_ draft: LeadDraft) async throws -> Lead { try await mock.createLead(draft) }
    func registerPushToken(_ token: String, environment: PushEnvironment, language: String?) async throws {
        try await mock.registerPushToken(token, environment: environment, language: language)
    }
    func unregisterPushToken() async throws { await mock.unregisterPushToken() }
    enum Failure: Error { case offline }
}

@Test func salesFiguresOnDemo() async throws {
    let api = MockVenioAPI()
    let figures = try await SalesFigures(leads: api.leads(), quotes: api.quotes(), userId: MockVenioAPI.lea.id,
        now: api.clock.now, calendar: api.clock.calendar, monthlyTarget: api.monthlyTarget())
    #expect(figures.signedThisMonth == 27300)
    #expect(figures.monthlyTarget == 40000)
    #expect(figures.targetPercent == 68)
    #expect(figures.months.map(\.amount) == [18200, 24600, 9800, 15400, 31200, 27300])
    #expect(figures.conversionPercent == 24)
    #expect(figures.averageCycleDays == 34)
    #expect(Dictionary(uniqueKeysWithValues: figures.lossReasons.map { ($0.reason, $0.percent) }) ==
        ["budget": 42, "concurrent": 28, "timing": 18, "sans réponse": 12])
}

@Test func interactionIdempotency() async throws {
    let api = MockVenioAPI()
    var draft = InteractionDraft(idempotencyKey: UUID(), subjectType: .lead, subjectId: "lead-calder",
        kind: .note, body: "Compte rendu", direction: .none, occurredAt: api.clock.now)
    let first = try await api.createInteraction(draft)
    let replay = try await api.createInteraction(draft)
    #expect(first.id == replay.id)
    draft.body = "Autre contenu"
    await #expect(throws: VenioAPIError(code: "IDEMPOTENCY_CONFLICT")) { try await api.createInteraction(draft) }
}

@Test func quoteWriteRules() async throws {
    let api = MockVenioAPI()
    await #expect(throws: VenioAPIError(code: "PROJECT_OUT_OF_SCOPE")) {
        try await api.createQuote(templateId: "template-site", projectId: "project-morel", title: nil)
    }
    let responsible = try await api.createQuote(templateId: "template-site", projectId: "project-pilote", title: nil)
    #expect(responsible.project == "project-pilote")
    let clientOwner = try await api.createQuote(templateId: "template-site", projectId: "project-riviere", title: nil)
    #expect(clientOwner.project == "project-riviere")
    let billing = MockVenioAPI(user: MockVenioAPI.raphael)
    let outside = try await billing.createQuote(templateId: "template-site", projectId: "project-morel", title: nil)
    #expect(outside.project == "project-morel")
    await #expect(throws: VenioAPIError(code: "PROPOSAL_NOT_DRAFT")) { try await api.sendQuote(id: "quote-041") }
}
