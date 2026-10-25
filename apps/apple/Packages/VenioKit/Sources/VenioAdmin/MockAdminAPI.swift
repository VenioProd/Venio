import Foundation
import VenioCore

public actor MockAdminAPI: AdminAPI {
    public static let demoUser = UserSummary(id: "user-raphael", name: "Raphaël B.", initials: "RB", role: .admin, permissions: [
        "view_projects", "edit_projects", "view_content", "edit_content", "view_phases", "manage_phases",
        "view_billing", "manage_billing", "view_accounting", "manage_accounting", "view_messaging", "send_messages",
        "manage_channels", "view_tickets", "create_tickets", "manage_tickets", "view_change_requests", "manage_change_requests",
        "view_dev", "manage_dev", "manage_quotes", "view_crm", "manage_crm", "manage_admins", "lock_accounting", "export_fec", "manage_external_sources"
    ])
    public nonisolated let clock: DemoClock
    private let user: UserSummary
    private var data: AdminDemoData
    // UserSummary regroupe les rôles admin ; le compte de démo représente SUPER_ADMIN.
    private var isSuperAdmin: Bool { user.id == Self.demoUser.id && user.role == .admin }
    private var visibleTickets: [Ticket] {
        data.tickets.filter { isSuperAdmin || data.ticketAuthors[$0.id] == user.id }
    }

    public init(clock: DemoClock = DemoClock(), user: UserSummary = MockAdminAPI.demoUser) {
        self.clock = clock
        self.user = user
        data = AdminDemoData(clock: clock)
    }
    private func require(_ permissions: Set<String>) throws {
        guard permissions.isSubset(of: user.permissions) else { throw AdminAPIError.forbidden }
    }
    private func detailIndex(_ id: String) throws -> Int {
        guard let index = data.details.firstIndex(where: { $0.project.id == id }) else { throw AdminAPIError.notFound }
        return index
    }
    private func ticketIndex(_ id: String) throws -> Int {
        guard let index = data.tickets.firstIndex(where: { $0.id == id }) else { throw AdminAPIError.notFound }
        return index
    }
    private func requireText(_ text: String, maximum: Int = .max) throws {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.count <= maximum else { throw AdminAPIError.invalidInput }
    }
    public func businessOverview() throws -> BusinessOverview {
        guard !user.permissions.isDisjoint(with: ["view_billing", "view_accounting"]) else { throw AdminAPIError.forbidden }
        return data.overview
    }
    public func remindInvoice(id: String) throws -> OverdueInvoice {
        try require(["manage_billing"])
        guard let index = data.overview.overdueInvoices.firstIndex(where: { $0.id == id }) else { throw AdminAPIError.notFound }
        data.overview.overdueInvoices[index].lastReminderAt = clock.now
        return data.overview.overdueInvoices[index]
    }
    public func projects() throws -> [AdminProject] {
        try require(["view_projects"])
        return data.details.map { detail in
            var project = detail.project
            if !user.permissions.contains("view_phases") { project.progress = 0; project.currentPhase = nil }
            if !user.permissions.contains("view_change_requests") { project.openChangeRequests = 0 }
            return project
        }
    }
    public func projectDetail(id: String) throws -> AdminProjectDetail {
        try require(["view_projects"])
        var detail = data.details[try detailIndex(id)]
        if !user.permissions.contains("view_phases") {
            detail.phases = []
            detail.project.progress = 0
            detail.project.currentPhase = nil
        }
        if !user.permissions.contains("view_content") { detail.items = [] }
        if !user.permissions.contains("view_change_requests") { detail.project.openChangeRequests = 0 }
        return detail
    }
    public func transitionPhase(projectId: String, phaseId: String, action: PhaseAction) throws -> AdminPhase {
        try require(["manage_phases"])
        let projectIndex = try detailIndex(projectId)
        let phases = data.details[projectIndex].phases
        guard let index = phases.firstIndex(where: { $0.id == phaseId }) else { throw AdminAPIError.notFound }
        var phase = phases[index]
        let next: AdminPhaseStatus
        switch (action, phase.status) {
        case (.start, .upcoming):
            if phases.contains(where: { $0.order < phase.order && $0.requiresClientValidation && $0.status != .completed }) {
                throw AdminAPIError.conflict("PHASE_LOCKED")
            }
            next = .inProgress
        case (.requestValidation, .inProgress):
            guard phase.requiresClientValidation else { throw AdminAPIError.conflict("VALIDATION_NOT_REQUIRED") }
            next = .awaitingValidation
        case (.complete, .inProgress):
            guard !phase.requiresClientValidation else { throw AdminAPIError.conflict("CLIENT_VALIDATION_REQUIRED") }
            next = .completed
        case (.cancelValidationRequest, .awaitingValidation): next = .inProgress
        case (.revert, .inProgress): next = .upcoming
        case (.revert, .completed):
            guard !phase.requiresClientValidation else { throw AdminAPIError.conflict("VALIDATED_PHASE_IMMUTABLE") }
            next = .inProgress
        default: throw AdminAPIError.conflict("INVALID_TRANSITION")
        }
        phase.status = next
        data.details[projectIndex].phases[index] = phase
        let updated = data.details[projectIndex].phases
        data.details[projectIndex].project.progress = updated.filter { $0.status == .completed }.count * 100 / updated.count
        let current = updated.firstIndex { $0.status == .inProgress || $0.status == .awaitingValidation }
        data.details[projectIndex].project.currentPhase = current.map { CurrentPhase(title: updated[$0].title, rank: $0 + 1, total: updated.count) }
        return phase
    }
    public func publishUpdate(projectId: String, title: String, body: String) throws -> ClientUpdate {
        try require(["edit_projects"])
        try requireText(title)
        let index = try detailIndex(projectId)
        let update = ClientUpdate(id: UUID().uuidString, title: title, body: body, createdAt: clock.now)
        data.details[index].updates.insert(update, at: 0)
        return update
    }
    public func setItemVisibility(projectId: String, itemId: String, visible: Bool) throws -> ProjectItem {
        try require(["edit_content"])
        let projectIndex = try detailIndex(projectId)
        guard let index = data.details[projectIndex].items.firstIndex(where: { $0.id == itemId }) else { throw AdminAPIError.notFound }
        data.details[projectIndex].items[index].isVisible = visible
        return data.details[projectIndex].items[index]
    }
    public func changeRequests() throws -> [ChangeRequest] { try require(["view_change_requests"]); return data.requests }
    public func triage(changeRequestId: String, action: TriageAction) throws -> ChangeRequest {
        try require(["manage_change_requests"])
        if case .quote = action { try require(["manage_billing"]) }
        guard let index = data.requests.firstIndex(where: { $0.id == changeRequestId }) else { throw AdminAPIError.notFound }
        var request = data.requests[index]
        switch (action, request.status) {
        case (.include, .submitted): request.status = .planned
        case (.quote(let projectId), .submitted):
            guard let project = data.details.first(where: { $0.project.id == projectId })?.project,
                  project.clientName == request.clientName else { throw AdminAPIError.invalidInput }
            request.projectId = project.id
            request.projectName = project.name
            request.status = .toQuote
        case (.refuse(let reason), .submitted), (.refuse(let reason), .toQuote):
            try requireText(reason)
            request.status = .refused
        case (.start, .planned): request.status = .inProgress
        case (.deliver, .inProgress): request.status = .delivered
        default: throw AdminAPIError.conflict("INVALID_TRANSITION")
        }
        data.requests[index] = request
        for index in data.details.indices {
            let projectId = data.details[index].project.id
            data.details[index].project.openChangeRequests = data.requests.filter { $0.projectId == projectId && $0.status.isOpen }.count
        }
        return request
    }
    public func projectFinance(projectId: String) throws -> ProjectFinance {
        try require(["view_accounting"])
        guard let finance = data.finance[projectId] else { throw AdminAPIError.notFound }
        return finance
    }
    public func conversations() throws -> [Conversation] { try require(["view_messaging"]); return data.conversations }
    public func messages(conversationId: String) throws -> [Message] {
        try require(["view_messaging"])
        guard let messages = data.messages[conversationId] else { throw AdminAPIError.notFound }
        return messages
    }
    public func sendMessage(conversationId: String, content: String) throws -> Message {
        try require(["view_messaging", "send_messages"])
        try requireText(content, maximum: 4000)
        guard let index = data.conversations.firstIndex(where: { $0.id == conversationId }) else { throw AdminAPIError.notFound }
        let message = Message(id: UUID().uuidString, senderName: user.name, senderId: user.id, content: content, createdAt: clock.now, isDeleted: false)
        data.messages[conversationId, default: []].append(message)
        data.conversations[index].lastMessageAt = message.createdAt
        data.conversations[index].lastMessagePreview = content
        data.conversations[index].unreadCount = 0
        data.conversations.sort { ($0.lastMessageAt ?? .distantPast) > ($1.lastMessageAt ?? .distantPast) }
        return message
    }
    public func markRead(conversationId: String) throws {
        try require(["view_messaging"])
        guard let index = data.conversations.firstIndex(where: { $0.id == conversationId }) else { throw AdminAPIError.notFound }
        data.conversations[index].unreadCount = 0
    }
    public func activity() -> [ActivitySection] {
        var sections: [ActivitySection] = []
        if user.permissions.contains("view_messaging") {
            sections.append(ActivitySection(key: "messages", title: "Messages non lus", entries: data.conversations.filter { $0.unreadCount > 0 }.map {
                ActivityEntry(id: $0.id, title: $0.title, meta: $0.lastMessagePreview ?? "", dueAt: nil)
            }, hasMore: false))
        }
        if user.permissions.contains("view_projects") {
            sections.append(ActivitySection(key: "projects", title: "Livraisons", entries: data.details.map {
                ActivityEntry(id: $0.project.id, title: $0.project.name, meta: $0.project.clientName, dueAt: $0.project.endDate)
            }.sorted { ($0.dueAt ?? .distantFuture) < ($1.dueAt ?? .distantFuture) }, hasMore: false))
        }
        if user.permissions.contains("view_billing") {
            sections.append(ActivitySection(key: "billing", title: "Factures critiques", entries: data.overview.overdueInvoices.map {
                ActivityEntry(id: $0.id, title: $0.number, meta: "Échéance", dueAt: $0.dueAt)
            }.sorted { ($0.dueAt ?? .distantFuture) < ($1.dueAt ?? .distantFuture) }, hasMore: false))
        }
        if user.permissions.contains("view_tickets") {
            sections.append(ActivitySection(key: "tickets", title: "Tickets", entries: visibleTickets.filter { $0.status == .open || $0.status == .inProgress }.map {
                ActivityEntry(id: $0.id, title: $0.title, meta: $0.authorName, dueAt: nil)
            }, hasMore: false))
        }
        return sections
    }
    public func tickets() throws -> [Ticket] { try require(["view_tickets"]); return visibleTickets }
    public func replyTicket(id: String, message: String) throws -> Ticket {
        try require(["manage_tickets"])
        guard isSuperAdmin else { throw AdminAPIError.forbidden }
        try requireText(message)
        let index = try ticketIndex(id)
        data.tickets[index].replies.append(TicketReply(authorId: user.id, authorName: user.name, message: message, createdAt: clock.now))
        if data.tickets[index].status == .open { data.tickets[index].status = .inProgress }
        return data.tickets[index]
    }
    public func setTicketStatus(id: String, status: AdminTicketStatus) throws -> Ticket {
        try require(["manage_tickets"])
        guard isSuperAdmin else { throw AdminAPIError.forbidden }
        guard status != .unknown else { throw AdminAPIError.invalidInput }
        let index = try ticketIndex(id)
        data.tickets[index].status = status
        return data.tickets[index]
    }
    public func devIssues() throws -> [DevIssue] { try require(["view_dev"]); return data.issues }
    public func setDevIssueStatus(id: String, status: DevIssueStatus) throws -> DevIssue {
        try require(["manage_dev"])
        guard status != .unknown else { throw AdminAPIError.invalidInput }
        guard let index = data.issues.firstIndex(where: { $0.id == id }) else { throw AdminAPIError.notFound }
        data.issues[index].status = status
        return data.issues[index]
    }
}
