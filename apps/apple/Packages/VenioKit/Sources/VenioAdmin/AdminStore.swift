import Foundation
import Observation
import VenioCore

public enum AdminLoadState: Sendable, Equatable {
    case idle, loading, loaded, failed(AdminAPIError)
}

public enum AdminOperation: Hashable, Sendable {
    /// Écritures qui préviennent quelqu'un (e-mail au client, message, réponse) : un échec réseau ne dit pas si elles sont parties.
    public var notifiesSomeone: Bool {
        switch self {
        case .invoice, .update, .sendMessage, .ticket: true
        default: false
        }
    }
    case load(AdminSection), project(String), changeRequests, finance(String), messages(String)
    case invoice(String), phase(projectId: String, phaseId: String), update(String)
    case item(projectId: String, itemId: String), triage(String), sendMessage(String), markRead(String)
    case ticket(String), devIssue(String)
}

@Observable @MainActor public final class AdminStore {
    public let user: UserSummary
    public let clock: DemoClock
    public var availableSections: [AdminSection] { AdminSection.available(for: user.permissions) }
    public let isSuperAdmin: Bool
    public var capabilities: AdminCapabilities { AdminCapabilities(permissions: user.permissions, isSuperAdmin: isSuperAdmin) }
    public private(set) var sectionStates: [AdminSection: AdminLoadState] = [:]
    public private(set) var inFlight: Set<AdminOperation> = []
    public private(set) var errors: [AdminOperation: AdminAPIError] = [:]
    public private(set) var business: BusinessOverview?
    public private(set) var projects: [AdminProject] = []
    public private(set) var projectDetails: [String: AdminProjectDetail] = [:]
    public private(set) var changeRequests: [ChangeRequest] = []
    public private(set) var projectFinances: [String: ProjectFinance] = [:]
    public private(set) var conversations: [Conversation] = []
    public private(set) var messages: [String: [Message]] = [:]
    public private(set) var activity: [ActivitySection] = []
    public private(set) var tickets: [Ticket] = []
    public private(set) var devIssues: [DevIssue] = []
    private let api: any AdminAPI
    @ObservationIgnored private var tasks: [AdminOperation: Task<Void, Never>] = [:]

    public init(api: any AdminAPI, user: UserSummary, isSuperAdmin: Bool, clock: DemoClock = DemoClock()) {
        self.api = api
        self.user = user
        self.isSuperAdmin = isSuperAdmin
        self.clock = clock
        sectionStates = Dictionary(uniqueKeysWithValues: AdminSection.allCases.map { ($0, .idle) })
    }
    public func state(for section: AdminSection) -> AdminLoadState { sectionStates[section, default: .idle] }
    public func reset() {
        tasks.values.forEach { $0.cancel() }
        tasks = [:]
        inFlight = []
        errors = [:]
        sectionStates = Dictionary(uniqueKeysWithValues: AdminSection.allCases.map { ($0, .idle) })
        business = nil
        projects = []
        projectDetails = [:]
        changeRequests = []
        projectFinances = [:]
        conversations = []
        messages = [:]
        activity = []
        tickets = []
        devIssues = []
    }
    private func perform<T: Sendable>(_ operation: AdminOperation, section: AdminSection? = nil,
                                      fetch: @escaping @Sendable () async throws -> T,
                                      apply: @escaping @MainActor (T) -> Void) async {
        guard !inFlight.contains(operation), !Task.isCancelled else { return }
        inFlight.insert(operation)
        errors[operation] = nil
        if let section { sectionStates[section] = .loading }
        let task = Task { @MainActor in
            do {
                try Task.checkCancellation()
                let result = try await fetch()
                try Task.checkCancellation()
                apply(result)
                if let section { sectionStates[section] = .loaded }
            } catch {
                guard !Task.isCancelled else { return }
                if error is CancellationError || (error as? URLError)?.code == .cancelled {
                    if let section { sectionStates[section] = .idle }
                    return
                }
                let error = AdminAPIError(error)
                errors[operation] = error
                if let section { sectionStates[section] = .failed(error) }
            }
        }
        tasks[operation] = task
        await withTaskCancellationHandler { await task.value } onCancel: { task.cancel() }
        if tasks[operation] == task {
            tasks[operation] = nil
            inFlight.remove(operation)
            if task.isCancelled, let section { sectionStates[section] = .idle }
        }
    }
    public func refresh(_ section: AdminSection) async {
        guard availableSections.contains(section) else {
            sectionStates[section] = .failed(.forbidden)
            return
        }
        switch section {
        case .business: await loadBusiness()
        case .projects: await loadProjects()
        case .messaging: await loadConversations()
        case .activity: await loadActivity()
        case .tickets: await loadTickets()
        case .dev: await loadDevIssues()
        }
    }
    public func loadBusiness() async {
        await perform(.load(.business), section: .business, fetch: { [api] in try await api.businessOverview() }) { [self] in business = $0 }
    }
    public func loadProjects() async {
        await perform(.load(.projects), section: .projects, fetch: { [api] in try await api.projects() }) { [self] in projects = $0 }
    }
    public func loadProject(id: String) async {
        await perform(.project(id), fetch: { [api] in try await api.projectDetail(id: id) }) { [self] detail in
            var detail = detail
            // La fiche serveur ne peuple pas le client : on garde le nom venu de la liste.
            if detail.project.clientName.isEmpty, let known = projects.first(where: { $0.id == id }) {
                detail.project.clientName = known.clientName
            }
            projectDetails[id] = detail
            replace(detail.project, in: &projects)
        }
    }
    public func loadChangeRequests() async {
        await perform(.changeRequests, fetch: { [api] in try await api.changeRequests() }) { [self] in changeRequests = $0 }
    }
    public func loadProjectFinance(projectId: String) async {
        await perform(.finance(projectId), fetch: { [api] in try await api.projectFinance(projectId: projectId) }) { [self] in projectFinances[projectId] = $0 }
    }
    public func loadConversations() async {
        await perform(.load(.messaging), section: .messaging, fetch: { [api] in try await api.conversations() }) { [self] in conversations = $0 }
    }
    public func loadMessages(conversationId: String) async {
        await perform(.messages(conversationId), fetch: { [api] in try await api.messages(conversationId: conversationId) }) { [self] in messages[conversationId] = $0 }
    }
    public func loadActivity() async {
        await perform(.load(.activity), section: .activity, fetch: { [api] in try await api.activity() }) { [self] in activity = $0 }
    }
    public func loadTickets() async {
        await perform(.load(.tickets), section: .tickets, fetch: { [api] in try await api.tickets() }) { [self] in tickets = $0 }
    }
    public func loadDevIssues() async {
        await perform(.load(.dev), section: .dev, fetch: { [api] in try await api.devIssues() }) { [self] in devIssues = $0 }
    }
    public func remindInvoice(id: String) async {
        await perform(.invoice(id), fetch: { [api] in try await api.remindInvoice(id: id) }) { [self] invoice in
            if var overview = business { replace(invoice, in: &overview.overdueInvoices); business = overview }
        }
        if errors[.invoice(id)]?.isUncertain == true { await loadBusiness() }
    }

    public func transitionPhase(projectId: String, phaseId: String, action: PhaseAction) async {
        await perform(.phase(projectId: projectId, phaseId: phaseId), fetch: { [api] in
            try await api.transitionPhase(projectId: projectId, phaseId: phaseId, action: action)
        }) { [self] phase in
            guard var detail = projectDetails[projectId] else { return }
            replace(phase, in: &detail.phases)
            detail.phases.sort { $0.order < $1.order }
            detail.project.progress = detail.phases.filter { $0.status == .completed }.count * 100 / max(1, detail.phases.count)
            let current = detail.phases.firstIndex { $0.status == .inProgress || $0.status == .awaitingValidation }
            detail.project.currentPhase = current.map { CurrentPhase(title: detail.phases[$0].title, rank: $0 + 1, total: detail.phases.count) }
            projectDetails[projectId] = detail
            replace(detail.project, in: &projects)
        }
    }
    public func publishUpdate(projectId: String, title: String, body: String) async {
        await perform(.update(projectId), fetch: { [api] in try await api.publishUpdate(projectId: projectId, title: title, body: body) }) { [self] in
            projectDetails[projectId]?.updates.insert($0, at: 0)
        }
        if errors[.update(projectId)]?.isUncertain == true { await loadProject(id: projectId) }
    }

    public func setItemVisibility(projectId: String, itemId: String, visible: Bool) async {
        await perform(.item(projectId: projectId, itemId: itemId), fetch: { [api] in
            try await api.setItemVisibility(projectId: projectId, itemId: itemId, visible: visible)
        }) { [self] item in
            if var detail = projectDetails[projectId] { replace(item, in: &detail.items); projectDetails[projectId] = detail }
        }
    }
    public func triage(changeRequestId: String, action: TriageAction) async {
        await perform(.triage(changeRequestId), fetch: { [api] in try await api.triage(changeRequestId: changeRequestId, action: action) }) { [self] request in
            let previous = changeRequests.first { $0.id == request.id }
            replace(request, in: &changeRequests)
            guard let previous else { return }
            for index in projects.indices {
                let id = projects[index].id
                let wasOpen = previous.projectId == id && previous.status.isOpen
                let isOpen = request.projectId == id && request.status.isOpen
                projects[index].openChangeRequests = max(0, projects[index].openChangeRequests + (isOpen ? 1 : 0) - (wasOpen ? 1 : 0))
                projectDetails[id]?.project.openChangeRequests = projects[index].openChangeRequests
            }
        }
    }
    public func sendMessage(conversationId: String, content: String) async {
        await perform(.sendMessage(conversationId), fetch: { [api] in try await api.sendMessage(conversationId: conversationId, content: content) }) { [self] message in
            var list = messages[conversationId, default: []]
            replace(message, in: &list)
            messages[conversationId] = list
            if let index = conversations.firstIndex(where: { $0.id == conversationId }) {
                conversations[index].lastMessageAt = message.createdAt
                conversations[index].lastMessagePreview = message.content
                conversations[index].unreadCount = 0
                conversations.sort { ($0.lastMessageAt ?? .distantPast) > ($1.lastMessageAt ?? .distantPast) }
            }
        }
        if errors[.sendMessage(conversationId)]?.isUncertain == true { await loadMessages(conversationId: conversationId) }
    }

    public func markRead(conversationId: String) async {
        await perform(.markRead(conversationId), fetch: { [api] in try await api.markRead(conversationId: conversationId) }) { [self] _ in
            if let index = conversations.firstIndex(where: { $0.id == conversationId }) { conversations[index].unreadCount = 0 }
        }
    }
    public func replyTicket(id: String, message: String) async {
        await perform(.ticket(id), fetch: { [api] in try await api.replyTicket(id: id, message: message) }) { [self] in replace($0, in: &tickets) }
        if errors[.ticket(id)]?.isUncertain == true { await loadTickets() }
    }

    public func setTicketStatus(id: String, status: AdminTicketStatus) async {
        await perform(.ticket(id), fetch: { [api] in try await api.setTicketStatus(id: id, status: status) }) { [self] in replace($0, in: &tickets) }
    }
    public func setDevIssueStatus(id: String, status: DevIssueStatus) async {
        await perform(.devIssue(id), fetch: { [api] in try await api.setDevIssueStatus(id: id, status: status) }) { [self] in replace($0, in: &devIssues) }
    }
}

private func replace<T: Identifiable>(_ value: T, in list: inout [T]) {
    if let index = list.firstIndex(where: { $0.id == value.id }) { list[index] = value }
    else { list.append(value) }
}
