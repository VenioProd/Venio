import Foundation
import Observation
import VenioCore

@Observable @MainActor public final class CommercialStore {
    public private(set) var leads: [Lead] = []
    public private(set) var timeline: [String: [TimelineEntry]] = [:]
    public private(set) var quotes: [QuoteProposal] = []
    public private(set) var templates: [QuoteTemplate] = []
    public private(set) var monthlyTarget: Decimal?
    public private(set) var appointments: [Appointment] = []
    public private(set) var projects: [Project] = []
    public private(set) var projectDetails: [String: ProjectDetail] = [:]
    public private(set) var currentUser: UserSummary?
    public private(set) var isLoading = false
    public private(set) var failed = false
    public private(set) var hasLoaded = false
    public private(set) var errorKey: String?
    public var allLeads = false
    public let clock: DemoClock
    public var destination: DeepLink?
    public var routeFailed = false
    public var onLeadOpened: (@MainActor (Lead) -> Void)?
    #if os(iOS)
    var callPrompt: CallAttempt?
    private var pendingCall: CallAttempt?
    #endif
    private let api: any VenioAPI
    private var leadAliases: [String: String] = [:]

    public init(api: any VenioAPI, clock: DemoClock = DemoClock()) {
        self.api = api
        self.clock = clock
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

    public func load(force: Bool = false) async {
        guard !isLoading, force || !hasLoaded else { return }
        isLoading = true
        failed = false
        errorKey = nil
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
            for local in leads where local.id.hasPrefix("local-") && !newLeads.contains(where: { $0.id == local.id }) {
                if let confirmed = try? await api.lead(id: local.id) { leadAliases[local.id] = confirmed.id }
            }
            leads = newLeads
            quotes = newQuotes
            appointments = newAppointments
            projects = newProjects
            monthlyTarget = try await api.monthlyTarget()
            templates = canQuote ? try await api.quoteTemplates() : []
            timeline = newTimeline
            projectDetails = details
            hasLoaded = true
        } catch is CancellationError {
            return
        } catch { failed = true; errorKey = mobileErrorKey(error) }
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
    func canQuote(_ project: Project) -> Bool { project.canQuote }
    func lead(for id: String) -> Lead? { leads.first { $0.id == (leadAliases[id] ?? id) } }
    func createQuote(templateId: String, projectId: String? = nil, leadId: String? = nil) async throws -> QuoteProposal {
        let quote = try await api.createQuote(templateId: templateId, projectId: projectId, leadId: leadId, title: nil)
        quotes.removeAll { $0.id == quote.id }
        quotes.insert(quote, at: 0)
        return quote
    }
    func attachQuote(id: String, projectId: String) async throws {
        let quote = try await api.attachQuote(id: id, projectId: projectId)
        quotes.removeAll { $0.id == quote.id }
        quotes.insert(quote, at: 0)
    }
    func sendQuote(id: String) async throws {
        let quote = try await api.sendQuote(id: id)
        quotes.removeAll { $0.id == quote.id }
        quotes.insert(quote, at: 0)
    }

    @discardableResult public func createInteraction(_ draft: InteractionDraft) async throws -> TimelineEntry {
        let entry = try await api.createInteraction(draft)
        var entries = timeline[draft.subjectId, default: []]
        entries.removeAll { $0.id == entry.id }
        entries.append(entry)
        timeline[draft.subjectId] = entries.sorted { $0.date > $1.date }
        return entry
    }
    func createLead(_ draft: LeadDraft) async throws -> Lead {
        let lead = try await api.createLead(draft)
        leads.insert(lead, at: 0)
        return lead
    }
    func openLead(id: String) async {
        do {
            let lead = try await api.lead(id: id)
            if lead.id != id { leadAliases[id] = lead.id }
            replaceLead(lead)
            timeline[lead.id] = try await api.timeline(leadId: id)
            onLeadOpened?(lead)
        } catch { routeFailed = true }
    }
    private func replaceLead(_ lead: Lead) {
        leads.removeAll { $0.id == lead.id }
        leads.append(lead)
    }
    public func open(_ link: DeepLink) async {
        routeFailed = false
        do {
            var resolved = link
            switch link {
            case .lead(let id):
                replaceLead(try await api.lead(id: id))
            case .quote(let id):
                let refreshed = try await api.quotes()
                guard refreshed.contains(where: { $0.id == id }) else { throw VenioAPIError(code: "NOT_FOUND") }
                quotes = refreshed
            case .project(let id):
                projectDetails[id] = try await api.project(id: id)
            case .projectQuotes(let id):
                quotes = try await api.quotes()
                let matches = quotes.filter { $0.project == id }
                guard !matches.isEmpty else { throw VenioAPIError(code: "NOT_FOUND") }
                if matches.count == 1, let quote = matches.first { resolved = .quote(quote.id) }
            }
            destination = resolved
        } catch { routeFailed = true }
    }
    #if os(iOS)
    func beginCall(_ lead: Lead) { pendingCall = CallAttempt(lead: lead) }
    func cancelCall() { pendingCall = nil }
    func leftApplication() {
        if pendingCall?.leftAt == nil { pendingCall?.leftAt = .now }
    }
    func returnedToApplication() {
        guard var call = pendingCall else { return }
        pendingCall = nil
        guard let leftAt = call.leftAt else { return }
        let elapsed = Date.now.timeIntervalSince(call.startedAt)
        guard elapsed >= 0, elapsed <= 2 * 60 * 60 else { return }
        call.duration = max(0, Date.now.timeIntervalSince(leftAt))
        callPrompt = call
    }
    #endif

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
