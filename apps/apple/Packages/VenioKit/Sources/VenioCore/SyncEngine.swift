import Foundation

public actor SyncEngine {
    private let session: AuthSession
    private let store: SyncStore
    private var flight: (id: UUID, scope: UUID, task: Task<Void, any Error>)?
    public init(session: AuthSession, store: SyncStore) { self.session = session; self.store = store }

    public func sync() async throws {
        let scope = try await session.identity()
        if let current = flight {
            if current.scope == scope.id { return try await current.task.value }
            _ = try? await current.task.value
            if flight?.id == current.id { flight = nil }
            return try await sync()
        }
        let id = UUID()
        let task = Task { try await self.run(scope: scope) }
        flight = (id, scope.id, task)
        defer { if flight?.id == id { flight = nil } }
        try await task.value
    }
    private func run(scope: SessionIdentity) async throws {
        var reset = false
        while true {
            do { try await synchronize(scope: scope); return }
            catch let error as HTTPFailure where error.status == 410 && error.code == "SYNC_RESET_REQUIRED" && !reset {
                try await store.reset(scope: scope)
                reset = true
            }
        }
    }
    private func synchronize(scope: SessionIdentity) async throws {
        let rights: [(String, Set<String>)] = [
            ("leads", ["view_crm"]), ("interactions", ["view_crm"]), ("projects", ["view_projects"]),
            ("projectPhases", ["view_phases"]), ("projectUpdates", ["view_projects"]), ("quotes", ["manage_quotes", "view_billing"])
        ]
        let types = rights.filter { !scope.user.permissions.isDisjoint(with: $0.1) }.map(\.0) + ["deletions"]
        for type in types {
            var cursor = try await store.cursor(type: type, scope: scope)
            while true {
                try Task.checkCancellation()
                var query = [URLQueryItem(name: "limit", value: "200")]
                if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
                let (data, response) = try await session.send(session.request(path: "/api/mobile/sync/" + type, query: query), scope: scope)
                try HTTPFailure.check(data, response)
                let info = try ServerCoding.decoder().decode(SyncPageInfo.self, from: data)
                if info.hasMore && (info.nextCursor == nil || info.nextCursor == cursor) { throw VenioAPIError(code: "INVALID_CURSOR") }
                _ = try await store.applyPage(type: type, data: data, scope: scope)
                cursor = info.nextCursor
                if !info.hasMore { break }
            }
        }
    }
}
