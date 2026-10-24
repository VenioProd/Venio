import Foundation
import Observation
import VenioCore

@Observable @MainActor public final class CommercialStore {
    public private(set) var leads: [Lead] = []
    public private(set) var timeline: [String: [TimelineEntry]] = [:]
    public private(set) var quotes: [QuoteProposal] = []
    public private(set) var templates: [QuoteTemplate] = []
    public let monthlyTarget: Decimal?
    public private(set) var appointments: [Appointment] = []
    public private(set) var projects: [Project] = []
    public private(set) var projectDetails: [String: ProjectDetail] = [:]
    public private(set) var currentUser: UserSummary?
    public private(set) var isLoading = false
    public private(set) var failed = false
    public private(set) var hasLoaded = false
    public var allLeads = false
    public let clock: DemoClock
    private let api: any VenioAPI

    public init(api: any VenioAPI, clock: DemoClock = DemoClock(), monthlyTarget: Decimal? = nil) {
        self.api = api
        self.clock = clock
        self.monthlyTarget = monthlyTarget
    }

    public var visibleLeads: [Lead] {
        leads.filter { $0.status.isOpen && (allLeads || $0.assignedTo == currentUser?.id) }
    }

    public var summary: PipelineSummary {
        PipelineSummary(leads: leads, scope: allLeads ? .all : .mine(currentUser?.id ?? ""))
    }

    public var agenda: TodayAgenda {
        TodayAgenda(leads: leads, quotes: quotes, appointments: appointments, now: clock.now,
                    calendar: clock.calendar, userId: currentUser?.id ?? "")
    }

    public func load() async {
        guard !isLoading, !hasLoaded else { return }
        isLoading = true
        failed = false
        defer { isLoading = false }
        do {
            let user = try await api.currentUser()
            if user.role == .admin {
                currentUser = user
                hasLoaded = true
                return
            }
            let canReadCRM = user.permissions.contains("view_crm")
            let canQuote = !user.permissions.isDisjoint(with: ["manage_quotes", "manage_billing"])
            async let fetchedLeads: [Lead] = canReadCRM ? api.leads() : []
            async let fetchedQuotes: [QuoteProposal] = canQuote ? api.quotes() : []
            async let fetchedAppointments: [Appointment] = canReadCRM ? api.appointments() : []
            async let fetchedProjects: [Project] = user.permissions.contains("view_projects") ? api.projects() : []
            let (newLeads, newQuotes, newAppointments, newProjects) = try await
                (fetchedLeads, fetchedQuotes, fetchedAppointments, fetchedProjects)
            var newTimeline: [String: [TimelineEntry]] = [:]
            for lead in newLeads where lead.status.isOpen {
                newTimeline[lead.id] = try await api.timeline(leadId: lead.id).sorted { $0.date > $1.date }
            }
            var details: [String: ProjectDetail] = [:]
            for project in newProjects { details[project.id] = try await api.project(id: project.id) }
            try Task.checkCancellation()
            currentUser = user
            leads = newLeads
            quotes = newQuotes
            appointments = newAppointments
            projects = newProjects
            templates = canQuote ? try await api.quoteTemplates() : []
            timeline = newTimeline
            projectDetails = details
            hasLoaded = true
        } catch is CancellationError {
            return
        } catch { failed = true }
    }

    public var canManageQuotes: Bool {
        !(currentUser?.permissions ?? []).isDisjoint(with: ["manage_quotes", "manage_billing"])
    }
    public var canViewFigures: Bool {
        canManageQuotes && currentUser?.permissions.contains("view_crm") == true
    }
    public var figures: SalesFigures {
        SalesFigures(leads: leads, quotes: quotes, userId: currentUser?.id ?? "", now: clock.now,
                     calendar: clock.calendar, monthlyTarget: monthlyTarget)
    }
    func linkedProject(for lead: Lead) -> Project? {
        guard let client = lead.clientAccountId else { return nil }
        let matches = projects.filter { $0.client == client }
        return matches.count == 1 ? matches.first : nil
    }
    func createQuote(templateId: String, projectId: String) async throws -> QuoteProposal {
        let quote = try await api.createQuote(templateId: templateId, projectId: projectId, title: nil)
        quotes = try await api.quotes()
        return quote
    }
    func sendQuote(id: String) async throws {
        _ = try await api.sendQuote(id: id)
        quotes = try await api.quotes()
    }

    var contentIdentifiers: [String] {
        leads.flatMap { [$0.company, $0.contactName, $0.contactEmail, $0.contactPhone] }
            + projects.flatMap { [$0.client, $0.projectNumber] }
            + quotes.compactMap(\.reference)
            + [currentUser?.name ?? "", "Léa", "Hugo Bernard", "Raphaël B.", "Vivatech Paris", "Apple Pay"]
    }

    func userName(_ id: String?) -> String? {
        if id == currentUser?.id { return currentUser?.name }
        if id == MockVenioAPI.hugo.id { return MockVenioAPI.hugo.name }
        if id == MockVenioAPI.raphael.id { return MockVenioAPI.raphael.name }
        return nil
    }

    func initials(_ id: String?) -> String {
        guard let name = userName(id) else { return "?" }
        return name.split(separator: " ").compactMap(\.first).map(String.init).joined()
    }
}
