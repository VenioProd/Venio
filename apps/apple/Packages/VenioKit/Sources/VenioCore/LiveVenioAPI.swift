import Foundation

public struct MobilePreferences: Codable, Sendable, Equatable {
    public var theme: String
    public var background: String
    public var accent: String
    public var locale: String
    public init(theme: String, background: String, accent: String, locale: String) {
        self.theme = theme; self.background = background; self.accent = accent; self.locale = locale
    }
}

public actor LiveVenioAPI: VenioAPI {
    public nonisolated let session: AuthSession
    public nonisolated let store: SyncStore
    public nonisolated let syncEngine: SyncEngine
    public nonisolated let outbox: Outbox
    private var connected = true
    private var observers: [UUID: AsyncStream<Void>.Continuation] = [:]

    public init(session: AuthSession, store: SyncStore) {
        self.session = session; self.store = store
        syncEngine = SyncEngine(session: session, store: store)
        outbox = Outbox(session: session, store: store)
    }
    public func updates() -> AsyncStream<Void> {
        let id = UUID()
        let (stream, continuation) = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
        observers[id] = continuation
        continuation.onTermination = { [weak self] _ in Task { await self?.removeObserver(id) } }
        return stream
    }
    private func removeObserver(_ id: UUID) { observers[id] = nil }
    private func changed() { observers.values.forEach { $0.yield(()) } }
    public func setConnected(_ value: Bool) { connected = value }
    public func refresh() async throws {
        defer { changed() }
        guard connected else { return }
        try await outbox.drain()
        try await syncEngine.sync()
    }
    private func online(_ request: URLRequest, scope: SessionIdentity) async throws -> Data {
        guard connected else { throw VenioAPIError(code: "CONNECTION_REQUIRED") }
        do {
            let (data, response) = try await session.send(request, scope: scope)
            try HTTPFailure.check(data, response)
            return data
        } catch let error as URLError {
            if error.code == .cancelled { throw error }
            throw VenioAPIError(code: "CONNECTION_REQUIRED")
        }
    }
    public func currentUser() async throws -> UserSummary {
        let scope = try await session.identity()
        do {
            let data = try await online(session.request(path: "/api/auth/me"), scope: scope)
            var user = try ServerCoding.decoder().decode(MeDTO.self, from: data).user.model
            guard user.id == scope.user.id else { throw VenioAPIError(code: "SIGNED_OUT") }
            user.permissions = scope.user.permissions
            return user.summary
        } catch let error as VenioAPIError where error.code == "CONNECTION_REQUIRED" { return scope.user.summary }
    }
    public func leads() async throws -> [Lead] {
        let scope = try await session.identity()
        guard scope.user.permissions.contains("view_crm") else { return [] }
        var values = try await store.records(type: "leads", scope: scope).map { try ServerCoding.decoder().decode(LeadDTO.self, from: $0).model }
        for write in try await store.writes(scope: scope) where write.type == "leadPatch" {
            let value = try JSONDecoder().decode(LeadPatchWrite.self, from: write.payload)
            if let index = values.firstIndex(where: { $0.id == value.leadId }) { values[index].apply(value.patch) }
        }
        return values.sorted { $0.updatedAt > $1.updatedAt }
    }
    public func lead(id: String) async throws -> Lead {
        guard let lead = try await leads().first(where: { $0.id == id }) else { throw VenioAPIError(code: "NOT_FOUND") }
        return lead
    }
    public func timeline(leadId: String) async throws -> [TimelineEntry] {
        let scope = try await session.identity()
        guard scope.user.permissions.contains("view_crm") else { return [] }
        let interactions = try await store.records(type: "interactions", scope: scope)
            .map { try ServerCoding.decoder().decode(InteractionDTO.self, from: $0).model }
            .filter { $0.subjectType == .lead && $0.subjectId == leadId }
        var entries = TimelineEntry.merged(activities: [], interactions: interactions)
        for write in try await store.writes(scope: scope) where write.type == "interaction" {
            let draft = try JSONDecoder().decode(InteractionDraft.self, from: write.payload)
            if draft.subjectType == .lead && draft.subjectId == leadId { entries.append(draft.entry(failed: write.state == "failed")) }
        }
        return entries.sorted { $0.date == $1.date ? $0.id < $1.id : $0.date > $1.date }
    }
    public func projects() async throws -> [Project] {
        let scope = try await session.identity()
        guard scope.user.permissions.contains("view_projects") else { return [] }
        let phases = try await projectPhases(scope)
        return try await store.records(type: "projects", scope: scope).map {
            var project = try ServerCoding.decoder().decode(ProjectDTO.self, from: $0).model
            let children = phases.filter { $0.project == project.id }
            if !children.isEmpty { project.progress = children.filter { $0.status == .completed }.count * 100 / children.count }
            return project
        }
    }
    private func projectPhases(_ scope: SessionIdentity) async throws -> [ProjectPhase] {
        guard scope.user.permissions.contains("view_phases") else { return [] }
        return try await store.records(type: "projectPhases", scope: scope).map { try ServerCoding.decoder().decode(PhaseDTO.self, from: $0).model }
    }
    public func project(id: String) async throws -> ProjectDetail {
        let scope = try await session.identity()
        guard let project = try await projects().first(where: { $0.id == id }) else { throw VenioAPIError(code: "NOT_FOUND") }
        let phases = try await projectPhases(scope).filter { $0.project == id }.sorted { $0.order < $1.order }
        let updates = try await store.records(type: "projectUpdates", scope: scope)
            .map { try ServerCoding.decoder().decode(UpdateDTO.self, from: $0).model }.filter { $0.project == id }
        var requests: [ChangeRequest] = []
        if connected && scope.user.permissions.contains("view_change_requests") {
            do {
                let data = try await online(session.request(path: "/api/admin/change-requests", query: [URLQueryItem(name: "project", value: id)]), scope: scope)
                struct Response: Decodable { var changeRequests: [ChangeRequestDTO] }
                requests = try ServerCoding.decoder().decode(Response.self, from: data).changeRequests.map(\.model).filter { $0.project == id }
            } catch let error as VenioAPIError where error.code == "CONNECTION_REQUIRED" { requests = [] }
        }
        return ProjectDetail(project: project, phases: phases, requests: requests, tickets: [], updates: updates)
    }
    public func quotes() async throws -> [QuoteProposal] {
        let scope = try await session.identity()
        guard !scope.user.permissions.isDisjoint(with: ["manage_quotes", "view_billing", "manage_billing"]) else { return [] }
        return try await store.records(type: "quotes", scope: scope).map { try ServerCoding.decoder().decode(QuoteDTO.self, from: $0).model }.sorted { $0.createdAt > $1.createdAt }
    }
    public func quoteTemplates() async throws -> [QuoteTemplate] {
        let scope = try await session.identity()
        struct Response: Decodable { var templates: [TemplateDTO] }
        do {
            let data = try await online(session.request(path: "/api/admin/quote-templates"), scope: scope)
            let result = try ServerCoding.decoder().decode(Response.self, from: data).templates.map(\.model)
            try await saveSnapshot(type: "quoteTemplates", data: data, scope: scope)
            return result
        } catch let error as VenioAPIError where error.code == "CONNECTION_REQUIRED" {
            guard let data = try await snapshot(type: "quoteTemplates", scope: scope) else { return [] }
            return try ServerCoding.decoder().decode(Response.self, from: data).templates.map(\.model)
        }
    }
    public func appointments() async throws -> [Appointment] {
        let scope = try await session.identity()
        guard scope.user.permissions.contains("view_crm") else { return [] }
        var data: Data
        do {
            data = try await online(session.request(path: "/api/mobile/today", query: [URLQueryItem(name: "tz", value: "Europe/Paris")]), scope: scope)
            try await saveSnapshot(type: "today", data: data, scope: scope)
        } catch let error as VenioAPIError where error.code == "CONNECTION_REQUIRED" {
            guard let cached = try await snapshot(type: "today", scope: scope),
                  let stamp = try ServerCoding.object(cached)["_fetchedAt"] as? String,
                  let date = ServerCoding.date(stamp) else { return [] }
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone(identifier: "Europe/Paris")!
            guard calendar.isDateInToday(date) else { return [] }
            data = cached
        }
        return try ServerCoding.decoder().decode(TodayDTO.self, from: data).meetings.items.map { try $0.model(userID: scope.user.id) }
    }
    private func saveSnapshot(type: String, data: Data, scope: SessionIdentity) async throws {
        var object = try ServerCoding.object(data)
        object["_id"] = "snapshot"
        object["_fetchedAt"] = ISO8601DateFormatter().string(from: .now)
        try await store.put(type: type, json: JSONSerialization.data(withJSONObject: object), scope: scope)
    }
    private func snapshot(type: String, scope: SessionIdentity) async throws -> Data? { try await store.records(type: type, scope: scope).first }

    public func createInteraction(_ draft: InteractionDraft) async throws -> TimelineEntry {
        try await createInteraction(draft, scope: session.identity())
    }
    public func createInteraction(_ draft: InteractionDraft, scope: SessionIdentity) async throws -> TimelineEntry {
        guard scope.user.permissions.contains("manage_crm") else { throw VenioAPIError(code: "FORBIDDEN") }
        _ = try await store.enqueue(draft, scope: scope)
        changed()
        Task { try? await self.refresh() }
        return draft.entry()
    }
    public func updateLead(id: String, patch: LeadPatch) async throws -> Lead {
        let scope = try await session.identity()
        guard scope.user.permissions.contains("manage_crm") else { throw VenioAPIError(code: "FORBIDDEN") }
        var lead = try await lead(id: id)
        try await store.enqueue(leadId: id, patch: patch, scope: scope)
        lead.apply(patch)
        changed()
        Task { try? await self.refresh() }
        return lead
    }
    public func createLead(_ draft: LeadDraft) async throws -> Lead {
        let scope = try await session.identity()
        let data = try await online(session.request(path: "/api/admin/crm/leads", method: "POST", body: ServerCoding.encoder().encode(draft)), scope: scope)
        struct Response: Decodable { var lead: LeadDTO }
        let lead = try ServerCoding.decoder().decode(Response.self, from: data).lead.model
        if let raw = try ServerCoding.object(data)["lead"] { try? await store.put(type: "leads", json: JSONSerialization.data(withJSONObject: raw), scope: scope) }
        return lead
    }
    public func createQuote(templateId: String, projectId: String, title: String?) async throws -> QuoteProposal {
        guard connected else { throw VenioAPIError(code: "CONNECTION_REQUIRED") }
        let scope = try await session.identity()
        guard let project = try await projects().first(where: { $0.id == projectId }), project.allowsQuote(for: scope.user.summary) else { throw VenioAPIError(code: "PROJECT_OUT_OF_SCOPE") }
        struct Body: Encodable { var templateId: String; var project: String; var title: String? }
        return try await writeQuote(path: "/api/admin/quote-proposals/from-template", body: ServerCoding.encoder().encode(Body(templateId: templateId, project: projectId, title: title)), scope: scope)
    }
    public func sendQuote(id: String) async throws -> QuoteProposal {
        let scope = try await session.identity()
        return try await writeQuote(path: "/api/admin/quote-proposals/" + id + "/send", body: nil, scope: scope)
    }
    private func writeQuote(path: String, body: Data?, scope: SessionIdentity) async throws -> QuoteProposal {
        let data = try await online(session.request(path: path, method: "POST", body: body), scope: scope)
        struct Response: Decodable { var proposal: QuoteDTO }
        let result = try ServerCoding.decoder().decode(Response.self, from: data).proposal.model
        if let raw = try ServerCoding.object(data)["proposal"] { try? await store.put(type: "quotes", json: JSONSerialization.data(withJSONObject: raw), scope: scope) }
        return result
    }
    public func registerPushToken(_ token: String, environment: PushEnvironment, language: String?) async throws {
        let scope = try await session.identity()
        struct Body: Encodable { var token: String; var environment: PushEnvironment; var language: String? }
        _ = try await online(session.request(path: "/api/mobile/push/apns", method: "PUT", body: JSONEncoder().encode(Body(token: token, environment: environment, language: language))), scope: scope)
    }
    public func unregisterPushToken() async throws { let scope = try await session.identity(); _ = try await online(session.request(path: "/api/mobile/push/apns", method: "DELETE"), scope: scope) }
    public func preferences(scope: SessionIdentity) async throws -> MobilePreferences {
        let data = try await online(session.request(path: "/api/mobile/preferences"), scope: scope)
        return try ServerCoding.decoder().decode(MobilePreferences.self, from: data)
    }
    public func savePreferences(_ value: MobilePreferences, scope: SessionIdentity) async throws {
        _ = try await online(session.request(path: "/api/mobile/preferences", method: "PUT", body: JSONEncoder().encode(value)), scope: scope)
    }
}

private extension InteractionDraft {
    func entry(failed: Bool = false) -> TimelineEntry {
        TimelineEntry(id: "pending-" + idempotencyKey.uuidString, date: occurredAt, title: subject ?? "", body: body, deliveryState: failed ? .failed : .pending)
    }
}
private extension Lead {
    mutating func apply(_ patch: LeadPatch) {
        if let status = patch.status { self.status = status }
        if let lostReason = patch.lostReason { self.lostReason = lostReason }
        switch patch.nextActionAt {
        case .set(let date): nextActionAt = date
        case .clear: nextActionAt = nil
        case nil: break
        }
    }
}
