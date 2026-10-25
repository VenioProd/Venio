import Foundation
import VenioCore

public actor LiveAdminAPI: AdminAPI {
    public let session: AuthSession
    public init(session: AuthSession) { self.session = session }

    public func businessOverview() throws -> BusinessOverview { throw AdminAPIError.webOnly }
    public func remindInvoice(id: String) throws -> OverdueInvoice { throw AdminAPIError.webOnly }
    public func projectFinance(projectId: String) throws -> ProjectFinance { throw AdminAPIError.webOnly }
    public func devIssues() throws -> [DevIssue] { throw AdminAPIError.webOnly }
    public func setDevIssueStatus(id: String, status: DevIssueStatus) throws -> DevIssue { throw AdminAPIError.webOnly }

    private func scope(requiring permissions: Set<String>) async throws -> SessionIdentity {
        do {
            let scope = try await session.identity()
            guard permissions.isSubset(of: scope.user.permissions) else { throw AdminAPIError.forbidden }
            return scope
        } catch { throw AdminAPIError(error) }
    }
    private func data(_ path: String, scope: SessionIdentity, method: String = "GET",
                      query: [URLQueryItem] = [], body: Data? = nil) async throws -> Data {
        do {
            let request = try session.request(path: path, method: method, query: query, body: body)
            return try await session.data(for: request, scope: scope)
        } catch is CancellationError { throw CancellationError() }
        catch let error as URLError where error.code == .cancelled { throw error }
        catch { throw AdminAPIError(error) }
    }
    private func fetch<T: Decodable & Sendable>(_ type: T.Type, _ path: String, scope: SessionIdentity,
                                               method: String = "GET", query: [URLQueryItem] = [], body: Data? = nil) async throws -> T {
        let data = try await data(path, scope: scope, method: method, query: query, body: body)
        do { return try ServerCoding.decoder().decode(type, from: data) }
        catch { throw AdminAPIError.other }
    }
    private func projectPath(_ id: String) -> String { "/api/admin/projects/" + id }
    private func conversationPath(_ id: String) -> String { "/api/admin/messaging/conversations/" + id }
    private func phases(_ id: String, scope: SessionIdentity) async throws -> [AdminPhase] {
        guard scope.user.permissions.contains("view_phases") else { return [] }
        return try await fetch(PhasesResponse.self, projectPath(id) + "/phases", scope: scope).phases.map(\.model)
    }
    private func requests(scope: SessionIdentity) async throws -> [ChangeRequest] {
        try await fetch(RequestsResponse.self, "/api/admin/change-requests", scope: scope).changeRequests.map { $0.model() }
    }
    public func projects() async throws -> [AdminProject] {
        let scope = try await scope(requiring: ["view_projects"])
        let records = try await fetch(ProjectsResponse.self, "/api/admin/projects", scope: scope,
                                      query: [URLQueryItem(name: "includeClient", value: "true")]).projects.filter { $0.isArchived != true }
        let requests = scope.user.permissions.contains("view_change_requests") ? try await requests(scope: scope) : []
        return try await withThrowingTaskGroup(of: (Int, AdminProject).self) { group in
            var next = 0
            var result: [Int: AdminProject] = [:]
            func enqueue(_ index: Int) {
                let record = records[index]
                group.addTask {
                    let phases = try await self.phases(record._id, scope: scope)
                    return (index, record.model(phases: phases, requests: requests))
                }
            }
            while next < min(6, records.count) { enqueue(next); next += 1 }
            while let (index, project) = try await group.next() {
                result[index] = project
                if next < records.count { enqueue(next); next += 1 }
            }
            return records.indices.compactMap { result[$0] }
        }
    }
    public func projectDetail(id: String) async throws -> AdminProjectDetail {
        let scope = try await scope(requiring: ["view_projects"])
        let record = try await fetch(ProjectResponse.self, projectPath(id), scope: scope).project
        async let phases = phases(id, scope: scope)
        async let updates = fetch(UpdatesResponse.self, projectPath(id) + "/updates", scope: scope)
        async let documents = fetch(DocumentsResponse.self, projectPath(id) + "/documents", scope: scope)
        let items = scope.user.permissions.contains("view_content")
            ? try await fetch(ItemsResponse.self, projectPath(id) + "/items", scope: scope).items.map(\.model) : []
        let requests = scope.user.permissions.contains("view_change_requests") ? try await requests(scope: scope) : []
        let (loadedPhases, loadedUpdates, loadedDocuments) = try await (phases, updates, documents)
        return AdminProjectDetail(project: record.model(phases: loadedPhases, requests: requests), phases: loadedPhases,
            updates: loadedUpdates.updates.map(\.model), items: items, documents: loadedDocuments.documents.map(\.model))
    }
    public func transitionPhase(projectId: String, phaseId: String, action: PhaseAction) async throws -> AdminPhase {
        let scope = try await scope(requiring: ["manage_phases"])
        return try await fetch(PhaseResponse.self, projectPath(projectId) + "/phases/" + phaseId + "/" + action.rawValue,
                               scope: scope, method: "POST").phase.model
    }
    public func publishUpdate(projectId: String, title: String, body: String) async throws -> ClientUpdate {
        let scope = try await scope(requiring: ["edit_projects"])
        let body = try JSONEncoder().encode(["title": title, "description": body])
        return try await fetch(UpdateResponse.self, projectPath(projectId) + "/updates", scope: scope,
                               method: "POST", body: body).update.model
    }
    public func setItemVisibility(projectId: String, itemId: String, visible: Bool) async throws -> ProjectItem {
        let scope = try await scope(requiring: ["edit_content"])
        return try await fetch(ItemResponse.self, projectPath(projectId) + "/items/" + itemId, scope: scope,
                               method: "PATCH", body: JSONEncoder().encode(["isVisible": visible])).item.model
    }
    public func changeRequests() async throws -> [ChangeRequest] {
        let scope = try await scope(requiring: ["view_change_requests"])
        return try await requests(scope: scope)
    }
    public func triage(changeRequestId: String, action: TriageAction) async throws -> ChangeRequest {
        var permissions: Set<String> = ["manage_change_requests"]
        if case .quote = action { permissions.insert("manage_billing") }
        let scope = try await scope(requiring: permissions)
        let path = "/api/admin/change-requests/" + changeRequestId
        let previous = scope.user.permissions.contains("view_change_requests")
            ? try await fetch(RequestResponse.self, path, scope: scope).changeRequest.model() : nil
        let suffix: String
        let body: Data?
        switch action {
        case .include: suffix = "qualify-include"; body = nil
        case .quote(let projectId): suffix = "qualify-quote"; body = try JSONEncoder().encode(["projectId": projectId])
        case .refuse(let reason): suffix = "refuse"; body = try JSONEncoder().encode(["reason": reason])
        case .start: suffix = "start"; body = nil
        case .deliver: suffix = "deliver"; body = nil
        }
        return try await fetch(RequestResponse.self, path + "/" + suffix, scope: scope, method: "POST", body: body)
            .changeRequest.model(previous: previous)
    }
    public func conversations() async throws -> [Conversation] {
        let scope = try await scope(requiring: ["view_messaging"])
        return try await fetch(ConversationsResponse.self, "/api/admin/messaging/conversations", scope: scope).conversations.map(\.model)
    }
    public func messages(conversationId: String) async throws -> [Message] {
        let scope = try await scope(requiring: ["view_messaging"])
        return try await fetch(MessagesResponse.self, conversationPath(conversationId) + "/messages", scope: scope).messages.map(\.model)
    }
    public func sendMessage(conversationId: String, content: String) async throws -> Message {
        let scope = try await scope(requiring: ["view_messaging", "send_messages"])
        return try await fetch(MessageResponse.self, conversationPath(conversationId) + "/messages", scope: scope,
                               method: "POST", body: JSONEncoder().encode(["content": content])).message.model
    }
    public func markRead(conversationId: String) async throws {
        let scope = try await scope(requiring: ["view_messaging"])
        _ = try await data(conversationPath(conversationId) + "/read", scope: scope, method: "POST")
    }
    public func activity() async throws -> [ActivitySection] {
        let scope = try await scope(requiring: [])
        return try await fetch(ActivityResponse.self, "/api/admin/activity-center", scope: scope,
                               query: [URLQueryItem(name: "limit", value: "20")]).sections.map(\.model)
    }
    public func tickets() async throws -> [Ticket] {
        let scope = try await scope(requiring: ["view_tickets"])
        return try await fetch(Lossy<AdminTicketDTO>.self, "/api/admin/tickets", scope: scope).wrappedValue.map(\.model)
    }
    private func ticketScope() async throws -> SessionIdentity {
        let scope = try await scope(requiring: ["manage_tickets"])
        guard scope.user.role == "SUPER_ADMIN" else { throw AdminAPIError.forbidden }
        return scope
    }
    public func replyTicket(id: String, message: String) async throws -> Ticket {
        let scope = try await ticketScope()
        return try await fetch(AdminTicketDTO.self, "/api/admin/tickets/" + id + "/reply", scope: scope,
                               method: "POST", body: JSONEncoder().encode(["message": message])).model
    }
    public func setTicketStatus(id: String, status: AdminTicketStatus) async throws -> Ticket {
        let scope = try await ticketScope()
        guard status != .unknown else { throw AdminAPIError.invalidInput }
        return try await fetch(AdminTicketDTO.self, "/api/admin/tickets/" + id + "/status", scope: scope,
                               method: "PATCH", body: JSONEncoder().encode(["status": status.rawValue])).model
    }
}
