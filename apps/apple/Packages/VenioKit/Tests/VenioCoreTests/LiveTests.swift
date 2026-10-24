import Foundation
import SwiftData
import Synchronization
import Testing
@testable import VenioCore

private final class MemoryTokens: TokenStore {
    private struct Values { var session: StoredSession?; var clears = 0 }
    private let values: Mutex<Values>
    private let installation = UUID()
    init(_ session: StoredSession?) { values = Mutex(Values(session: session)) }
    func load() throws -> StoredSession? { values.withLock { $0.session } }
    func save(_ session: StoredSession) throws { values.withLock { $0.session = session } }
    func clear() throws { values.withLock { $0.session = nil; $0.clears += 1 } }
    func installationID() throws -> UUID { installation }
    var clearCount: Int { values.withLock { $0.clears } }
}
private actor FakeTransport: HTTPTransport {
    let handler: @Sendable (URLRequest) async throws -> (Int, Data)
    private(set) var paths: [String] = []
    init(_ handler: @escaping @Sendable (URLRequest) async throws -> (Int, Data)) { self.handler = handler }
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        paths.append(request.url!.path)
        let (status, data) = try await handler(request)
        return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}
private let base = URL(string: "https://transport.invalid")!
private let device = Device(id: "device", name: "Test", platform: "macos", model: "Mac", osVersion: "27", appVersion: "1", createdAt: .distantPast, lastSeenAt: .distantPast, expiresAt: .distantFuture, pushEnabled: false, current: true)
private let user = MobileUser(id: "user", name: "Test", email: "test@example.invalid", role: "COMMERCIAL", permissions: ["view_crm", "view_projects", "view_phases"])
private func tokens(_ suffix: String) -> TokenPair {
    TokenPair(accessToken: "fixture-access-" + suffix, accessTokenExpiresAt: .distantFuture, refreshToken: "fixture-refresh-" + suffix, refreshTokenExpiresAt: .distantFuture)
}
private func database() throws -> SyncStore {
    let schema = Schema([SyncedRecord.self, SyncCursor.self, PendingWrite.self])
    return SyncStore(modelContainer: try ModelContainer(for: schema, configurations: ModelConfiguration(isStoredInMemoryOnly: true)))
}
private func session(_ transport: FakeTransport, _ store: SyncStore, _ memory: MemoryTokens) async throws -> AuthSession {
    let auth = try AuthSession(baseURL: base, transport: transport, tokenStore: memory,
        deviceInfo: DeviceInfo(platform: "macos", name: "Test", model: "Mac", osVersion: "27", appVersion: "1"), dataStore: store)
    try await auth.restore()
    return auth
}
private func json(_ value: String) -> Data { Data(value.utf8) }
private func rotated() throws -> Data { try ServerCoding.encoder().encode(tokens("new")) }

@Test func timedOutRefreshDisconnectsAndPreservesWrites() async throws {
    let store = try database()
    let memory = MemoryTokens(StoredSession(tokens: tokens("old"), user: user, device: device))
    let transport = FakeTransport { request in
        if request.url!.path.hasSuffix("/refresh") {
            #expect(try memory.load()?.rotationPending == true)
            throw URLError(.timedOut)
        }
        return (401, Data())
    }
    let auth = try await session(transport, store, memory)
    let scope = try await auth.identity()
    try await store.enqueue(leadId: "lead", patch: LeadPatch(), scope: scope)
    let request = URLRequest(url: base.appendingPathComponent("protected"))
    await #expect(throws: (any Error).self) { _ = try await auth.send(request) }
    #expect(await auth.state == .signedOut)
    #expect(try memory.load() == nil)
    await #expect(throws: (any Error).self) { _ = try await auth.send(request) }
    #expect(await transport.paths.filter { $0.hasSuffix("/refresh") }.count == 1)
    let reconnected = SessionIdentity(id: UUID(), user: user)
    try await store.activate(reconnected)
    #expect(try await store.writes(scope: reconnected).count == 1)
}

@Test func offlineRefreshCanSucceedLater() async throws {
    let memory = MemoryTokens(StoredSession(tokens: tokens("old"), user: user, device: device))
    let calls = Mutex(0)
    let transport = FakeTransport { request in
        guard request.url!.path.hasSuffix("/refresh") else {
            return (request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-access-new" ? 200 : 401, Data())
        }
        let attempt = calls.withLock { $0 += 1; return $0 }
        #expect(try memory.load()?.rotationPending == true)
        if attempt == 1 { throw URLError(.notConnectedToInternet) }
        return (200, try rotated())
    }
    let auth = try await session(transport, database(), memory)
    let request = URLRequest(url: base.appendingPathComponent("protected"))
    await #expect(throws: URLError(.notConnectedToInternet)) { _ = try await auth.send(request) }
    #expect(await auth.state == .signedIn(user, device))
    let saved = try #require(try memory.load())
    #expect(!saved.rotationPending)
    _ = try await auth.send(request)
    #expect(await transport.paths.filter { $0.hasSuffix("/refresh") }.count == 2)
}

@Test func pendingRotationIsDiscardedOnStartup() async throws {
    let initial = StoredSession(tokens: tokens("old"), user: user, device: device)
    var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(initial)) as! [String: Any]
    object["rotationPending"] = true
    let saved = try JSONDecoder().decode(StoredSession.self, from: JSONSerialization.data(withJSONObject: object))
    let memory = MemoryTokens(saved)
    let transport = FakeTransport { _ in (401, Data()) }
    let auth = try await session(transport, database(), memory)
    #expect(await auth.state == .signedOut)
    #expect(try memory.load() == nil)
    await #expect(throws: (any Error).self) {
        _ = try await auth.send(URLRequest(url: base.appendingPathComponent("protected")))
    }
    #expect(await transport.paths.isEmpty)
}

@Test(arguments: [URLError.Code.timedOut, .cannotConnectToHost])
func leadPatchRetriesOnlyWhenCertainlyNotSent(_ code: URLError.Code) async throws {
    let store = try database()
    let transport = FakeTransport { _ in throw URLError(code) }
    let auth = try await session(transport, store, MemoryTokens(StoredSession(tokens: tokens("old"), user: user, device: device)))
    let scope = try await auth.identity()
    try await store.enqueue(leadId: "lead", patch: LeadPatch(), scope: scope)
    let outbox = Outbox(session: auth, store: store)
    try await outbox.drain()
    let write = try #require(try await store.writes(scope: scope).first)
    #expect(write.state == (code == .timedOut ? "failed" : "pending"))
    if code == .timedOut { #expect(write.lastError == "UNCERTAIN_WRITE") }
    try await outbox.drain()
    #expect(await transport.paths.count == 1)
}

private actor FiveRequests {
    var arrived = 0
    var waiting: [CheckedContinuation<Void, Never>] = []
    func meet() async {
        arrived += 1
        if arrived == 5 { waiting.forEach { $0.resume() }; waiting.removeAll(); return }
        await withCheckedContinuation { waiting.append($0) }
    }
}
@Test func refreshIsSingleFlightAndPersistedBeforeReplay() async throws {
    let memory = MemoryTokens(StoredSession(tokens: tokens("old"), user: user, device: device))
    let barrier = FiveRequests()
    let transport = FakeTransport { request in
        if request.url!.path.hasSuffix("/refresh") { return (200, try rotated()) }
        if request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-access-old" {
            await barrier.meet(); return (401, json(#"{"code":"INVALID_ACCESS_TOKEN"}"#))
        }
        #expect(try memory.load()?.tokens.refreshToken == "fixture-refresh-new")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-access-new")
        return (200, Data())
    }
    let auth = try await session(transport, database(), memory)
    try await withThrowingTaskGroup(of: Void.self) { group in
        for _ in 0..<5 { group.addTask { _ = try await auth.send(URLRequest(url: base.appendingPathComponent("protected"))) } }
        try await group.waitForAll()
    }
    let paths = await transport.paths
    #expect(paths.filter { $0.hasSuffix("/refresh") }.count == 1)
    #expect(paths.filter { $0 == "/protected" }.count == 10)
}
@Test func rejectedRefreshDisconnectsOnce() async throws {
    let memory = MemoryTokens(StoredSession(tokens: tokens("old"), user: user, device: device))
    let barrier = FiveRequests()
    let transport = FakeTransport { request in
        if request.url!.path.hasSuffix("/refresh") { return (401, json(#"{"code":"INVALID_REFRESH_TOKEN"}"#)) }
        await barrier.meet(); return (401, Data())
    }
    let auth = try await session(transport, database(), memory)
    await withTaskGroup(of: Void.self) { group in
        for _ in 0..<5 { group.addTask { _ = try? await auth.send(URLRequest(url: base.appendingPathComponent("protected"))) } }
    }
    #expect(try memory.load() == nil)
    #expect(memory.clearCount == 1)
    #expect(await auth.state == .signedOut)
    #expect(await transport.paths.filter { $0.hasSuffix("/refresh") }.count == 1)
}
@Test func secondUnauthorizedDisconnectsWithoutAnotherRefresh() async throws {
    let memory = MemoryTokens(StoredSession(tokens: tokens("old"), user: user, device: device))
    let transport = FakeTransport { request in
        if request.url!.path.hasSuffix("/refresh") { return (200, try rotated()) }
        return (401, json(#"{"code":"SOME_OTHER_401"}"#))
    }
    let auth = try await session(transport, database(), memory)
    await #expect(throws: (any Error).self) { _ = try await auth.send(URLRequest(url: base.appendingPathComponent("protected"))) }
    #expect(try memory.load() == nil)
    #expect(await auth.state == .signedOut)
    #expect(await transport.paths.filter { $0.hasSuffix("/refresh") }.count == 1)
}
private actor OutboxResponses {
    var step = 0; var keys: [String?] = []; var subjects: [String] = []
    func handle(_ request: URLRequest) throws -> (Int, Data) {
        step += 1; keys.append(request.value(forHTTPHeaderField: "Idempotency-Key"))
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        subjects.append(body["body"] as! String)
        if step == 1 { throw URLError(.notConnectedToInternet) }
        if step == 3 { return (409, json(#"{"code":"IDEMPOTENCY_CONFLICT"}"#)) }
        return (201, json(#"{"interaction":{"_id":"confirmed","subjectType":"LEAD","subjectId":"lead","kind":"NOTE","body":"first","occurredAt":"2026-10-24T10:00:00.000Z","author":null}}"#))
    }
}
@Test func outboxPreservesFIFOIdempotencyAndFailures() async throws {
    let store = try database(); let responses = OutboxResponses()
    let transport = FakeTransport { try await responses.handle($0) }
    let auth = try await session(transport, store, MemoryTokens(StoredSession(tokens: tokens("old"), user: user, device: device)))
    let scope = try await auth.identity(); let outbox = Outbox(session: auth, store: store)
    let first = InteractionDraft(idempotencyKey: UUID(), subjectType: .lead, subjectId: "lead", kind: .note, body: "first", direction: .none, occurredAt: .now)
    var second = first; second.idempotencyKey = UUID(); second.body = "second"
    _ = try await store.enqueue(first, scope: scope); _ = try await store.enqueue(second, scope: scope)
    try await outbox.drain()
    #expect(try await store.writes(scope: scope).count == 2)
    #expect(await responses.subjects == ["first"])
    let restored = Outbox(session: auth, store: store)
    try await restored.drain()
    let remaining = try await store.writes(scope: scope)
    #expect(remaining.count == 1 && remaining.first?.state == "failed")
    #expect(await Array(responses.keys.prefix(2)) == [first.idempotencyKey.uuidString, first.idempotencyKey.uuidString])
    #expect(await responses.subjects == ["first", "first", "second"])
    #expect(try await store.records(type: "interactions", scope: scope).count == 1)
    try await restored.drain()
    #expect(await responses.subjects.count == 3)
    var other = user; other.id = "another-user"
    await #expect(throws: VenioAPIError(code: "PENDING_WRITES_OTHER_ACCOUNT")) {
        try await store.activate(SessionIdentity(id: UUID(), user: other))
    }
    #expect(try await store.writes(scope: scope).count == 1)
}
private actor SyncResponses {
    var calls: [(String, String?)] = []; var reset = false
    func handle(_ request: URLRequest) -> (Int, Data) {
        let type = request.url!.lastPathComponent
        let cursor = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems?.first { $0.name == "cursor" }?.value
        calls.append((type, cursor))
        if reset && type == "deletions" && cursor != nil { reset = false; return (410, json(#"{"code":"SYNC_RESET_REQUIRED"}"#)) }
        if type == "leads" && cursor == nil { return (200, json(#"{"items":[{"_id":"lead","company":"A"}],"nextCursor":"leads-page1","hasMore":true}"#)) }
        if type == "leads" && cursor == "leads-page1" { return (200, json(#"{"items":[{"_id":"lead2","company":"B"}],"nextCursor":"leads-page2","hasMore":false}"#)) }
        if type == "projects" { return (200, json(#"{"items":[{"_id":"project","client":"client","name":"P"}],"nextCursor":"projects-end","hasMore":false}"#)) }
        if type == "projectPhases" || type == "projectUpdates" { return (200, json(#"{"items":[{"_id":"child","project":"project"}],"nextCursor":"children-end","hasMore":false}"#)) }
        if type == "deletions" { return (200, json(#"{"items":[{"_id":"gone","entityType":"projects","entityId":"project"}],"nextCursor":"deletions-end","hasMore":false}"#)) }
        return (200, json(#"{"items":[],"nextCursor":null,"hasMore":false}"#))
    }
    func requireReset() { reset = true }
}
@Test func syncPaginatesCascadesAndResets() async throws {
    let store = try database(); let responses = SyncResponses()
    let transport = FakeTransport { await responses.handle($0) }
    let auth = try await session(transport, store, MemoryTokens(StoredSession(tokens: tokens("old"), user: user, device: device)))
    let scope = try await auth.identity(); let engine = SyncEngine(session: auth, store: store)
    try await engine.sync()
    #expect(try await store.cursor(type: "leads", scope: scope) == "leads-page2")
    #expect(try await store.cursor(type: "projects", scope: scope) == "projects-end")
    #expect(try await store.records(type: "leads", scope: scope).count == 2)
    for type in ["projects", "projectPhases", "projectUpdates"] { #expect(try await store.records(type: type, scope: scope).isEmpty) }
    #expect(await responses.calls.contains { $0 == ("leads", "leads-page1") })
    await responses.requireReset(); try await engine.sync()
    #expect(await responses.calls.filter { $0.0 == "leads" && $0.1 == nil }.count == 2)
    #expect(try await store.records(type: "leads", scope: scope).count == 2)
}
@Test func serverLeadAndInteractionDTOs() throws {
    let lead = try ServerCoding.decoder().decode(LeadDTO.self, from: json(#"{"_id":"lead","company":"Atelier","contactName":"Camille","budget":14800,"assignedTo":{"_id":"user","name":"Camille"},"clientAccountId":null,"nextActionAt":null,"status":"PROPOSAL","priority":"NORMALE","leadTemperature":"CHAUD","createdAt":"2026-10-23T10:30:00.000Z","updatedAt":"2026-10-24T08:00:00Z","score":null}"#)).model
    #expect(lead.id == "lead" && lead.assignedTo == "user")
    #expect(lead.budget == 14800 && lead.nextActionAt == nil && lead.clientAccountId == nil)
    let interaction = try ServerCoding.decoder().decode(InteractionDTO.self, from: json(#"{"id":"interaction","source":"INTERACTION","subjectType":"LEAD","subjectId":"lead","kind":"CALL","direction":"OUT","occurredAt":"2026-10-24T08:00:00.000Z","label":"Rappel","body":"Compte rendu","author":{"_id":"user","name":"Camille","email":"camille@example.invalid"},"pinned":false,"recipients":[],"deliveryStatus":"NONE","lang":"fr"}"#)).model
    #expect(interaction.id == "interaction" && interaction.subjectId == "lead")
    #expect(interaction.author == "user" && interaction.subject == "Rappel" && interaction.direction == .outgoing)
}
