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
func leadPatchRetriesWithSameKey(_ code: URLError.Code) async throws {
    let store = try database()
    let keys = Mutex<[String?]>([])
    let transport = FakeTransport { request in
        keys.withLock { $0.append(request.value(forHTTPHeaderField: "Idempotency-Key")) }
        throw URLError(code)
    }
    let auth = try await session(transport, store, MemoryTokens(StoredSession(tokens: tokens("old"), user: user, device: device)))
    let scope = try await auth.identity()
    try await store.enqueue(leadId: "lead", patch: LeadPatch(), scope: scope)
    let original = try #require(try await store.writes(scope: scope).first)
    let outbox = Outbox(session: auth, store: store)
    try await outbox.drain()
    #expect(try await store.writes(scope: scope).first?.state == "pending")
    try await outbox.drain()
    #expect(await transport.paths.count == 1)
    try await Outbox(session: auth, store: store).drain()
    #expect(keys.withLock { $0 } == [original.id.uuidString, original.id.uuidString])
}

@Test(arguments: [false, true]) @MainActor func interruptedLeadPatchReplaysWithSameKey(expired: Bool) async throws {
    let store = try database()
    let key = Mutex<String?>(nil)
    let transport = FakeTransport { request in
        key.withLock { $0 = request.value(forHTTPHeaderField: "Idempotency-Key") }
        return (200, json(#"{"lead":{"_id":"lead"}}"#))
    }
    let auth = try await session(transport, store, MemoryTokens(StoredSession(tokens: tokens("old"), user: user, device: device)))
    let scope = try await auth.identity()
    try await store.enqueue(leadId: "lead", patch: LeadPatch(), scope: scope)
    let interrupted = try #require(try await store.writes(scope: scope).first)
    try await store.attempted(id: interrupted.id, scope: scope)
    if expired {
        let context = ModelContext(store.modelContainer)
        let record = try #require(context.fetch(FetchDescriptor<PendingWrite>()).first)
        record.firstAttemptAt = Date.now.addingTimeInterval(-23 * 60 * 60 - 1)
        try context.save()
    }
    try await Outbox(session: auth, store: store).drain()
    if expired {
        let write = try #require(try await store.writes(scope: scope).first)
        #expect(write.state == "failed")
        #expect(write.lastError == "UNCERTAIN_WRITE")
        #expect(await transport.paths.isEmpty)
    } else {
        #expect(try await store.writes(scope: scope).isEmpty)
        #expect(key.withLock { $0 } == interrupted.id.uuidString)
        #expect(await transport.paths == ["/api/admin/crm/leads/lead"])
    }
}

@Test func offlineLeadCreationRemapsQueuedReferences() async throws {
    let store = try database()
    let requests = Mutex<[URLRequest]>([])
    let transport = FakeTransport { request in
        requests.withLock { $0.append(request) }
        switch request.url!.path {
        case "/api/admin/crm/leads":
            return (201, json(#"{"lead":{"_id":"confirmed-lead","company":"Atelier","assignedTo":"user"}}"#))
        case "/api/mobile/interactions":
            let body = try ServerCoding.object(request.httpBody!)
            #expect(body["subjectId"] as? String == "confirmed-lead")
            return (201, json(#"{"interaction":{"_id":"note","subjectType":"LEAD","subjectId":"confirmed-lead","kind":"NOTE","occurredAt":"2026-10-23T12:00:00.000Z"}}"#))
        default:
            #expect(request.url!.path == "/api/admin/crm/leads/confirmed-lead")
            return (200, json(#"{"lead":{"_id":"confirmed-lead","company":"Atelier","assignedTo":"user","status":"CONTACTED"}}"#))
        }
    }
    var writer = user
    writer.permissions.insert("manage_crm")
    let auth = try await session(transport, store, MemoryTokens(StoredSession(tokens: tokens("old"), user: writer, device: device)))
    let api = LiveVenioAPI(session: auth, store: store)
    await api.setConnected(false)
    let lead = try await api.createLead(LeadDraft(company: "Atelier", contactName: "Camille", assignedTo: writer.id))
    #expect(lead.id.hasPrefix("local-"))
    #expect(lead.deliveryState == "pending")
    let scope = try await auth.identity()
    let creation = try #require(try await store.writes(scope: scope).first)
    #expect(creation.type == "leadCreate")
    let draft = InteractionDraft(idempotencyKey: UUID(), subjectType: .lead, subjectId: lead.id,
                                 kind: .note, body: "Note hors ligne", direction: .none, occurredAt: .now)
    _ = try await api.createInteraction(draft)
    _ = try await api.updateLead(id: lead.id, patch: LeadPatch(status: .contacted))
    #expect(try await api.leads().contains { $0.id == lead.id })
    #expect(requests.withLock { $0.isEmpty })
    let queued = try await store.writes(scope: scope)
    try await api.outbox.drain()
    #expect(requests.withLock { $0.map { $0.url!.path } } == ["/api/admin/crm/leads", "/api/mobile/interactions", "/api/admin/crm/leads/confirmed-lead"])
    #expect(requests.withLock { $0.map { $0.value(forHTTPHeaderField: "Idempotency-Key") } } == queued.map { $0.id.uuidString })
    #expect(try await store.writes(scope: scope).isEmpty)
    #expect(try await api.leads().map(\.id) == ["confirmed-lead"])
    #expect(try await api.lead(id: lead.id).id == "confirmed-lead")
    #expect(try await api.timeline(leadId: lead.id).count == 1)
    var later = draft
    later.idempotencyKey = UUID()
    _ = try await store.enqueue(later, scope: scope)
    try await store.enqueue(leadId: lead.id, patch: LeadPatch(), scope: scope)
    let dependent = try await store.writes(scope: scope)
    #expect(try JSONDecoder().decode(InteractionDraft.self, from: dependent[0].payload).subjectId == "confirmed-lead")
    #expect(try JSONDecoder().decode(LeadPatchWrite.self, from: dependent[1].payload).leadId == "confirmed-lead")
}

@Test(arguments: ["interaction", "leadCreate", "leadPatch"], [500, 409, 429])
func keyedHTTPFailures(_ type: String, _ status: Int) async throws {
    let store = try database()
    let keys = Mutex<[String?]>([])
    let code = status == 409 ? "IDEMPOTENCY_IN_PROGRESS" : "HTTP_\(status)"
    let transport = FakeTransport { request in
        keys.withLock { $0.append(request.value(forHTTPHeaderField: "Idempotency-Key")) }
        return (status, try JSONEncoder().encode(["code": code]))
    }
    let auth = try await session(transport, store, MemoryTokens(StoredSession(tokens: tokens("old"), user: user, device: device)))
    let scope = try await auth.identity()
    switch type {
    case "leadCreate": _ = try await store.enqueue(LeadDraft(company: "Atelier"), scope: scope)
    case "leadPatch": try await store.enqueue(leadId: "lead", patch: LeadPatch(), scope: scope)
    default:
        _ = try await store.enqueue(InteractionDraft(idempotencyKey: UUID(), subjectType: .lead, subjectId: "lead", kind: .note,
                                                   body: "Note", direction: .none, occurredAt: .now), scope: scope)
    }
    let original = try #require(try await store.writes(scope: scope).first)
    try await Outbox(session: auth, store: store).drain()
    let result = try #require(try await store.writes(scope: scope).first)
    #expect(result.state == (status == 500 ? "failed" : "pending"))
    #expect(result.lastError == code)
    try await Outbox(session: auth, store: store).drain()
    if status == 500 {
        #expect(keys.withLock { $0.count } == 1)
        try await store.retry(id: original.id, scope: scope)
        let retried = try #require(try await store.writes(scope: scope).first)
        #expect(retried.id != original.id)
        try await Outbox(session: auth, store: store).drain()
        #expect(keys.withLock { $0.last! } == retried.id.uuidString)
    } else {
        #expect(keys.withLock { $0 } == [original.id.uuidString, original.id.uuidString])
    }
}

@Test func mobileMeetingAndLeadQuoteFixtures() throws {
    let today = json(#"""
    {"meetings":{"items":[{"id":"6718d8000000000000000001","source":"interaction","title":"Atelier Nova","startsAt":"2026-10-23T12:00:00.000Z","endsAt":"2026-10-23T13:00:00.000Z","lead":{"id":"6718d8000000000000000002","company":"Atelier Nova"},"projectId":null,"projectName":null},{"id":"task_6718d8000000000000000003","source":"task","title":"Livraison","startsAt":"2026-10-23T14:00:00.000Z","endsAt":null,"lead":null,"projectId":"6718d8000000000000000004","projectName":"Nova"}],"total":2}}
    """#)
    let meetings = try ServerCoding.decoder().decode(TodayDTO.self, from: today).meetings.items.map { $0.model(userID: "user") }
    #expect(meetings[0].leadId == "6718d8000000000000000002")
    #expect(meetings[0].startsAt == ServerCoding.date("2026-10-23T12:00:00.000Z"))
    #expect(meetings[0].endsAt == ServerCoding.date("2026-10-23T13:00:00.000Z"))
    #expect(meetings[1].leadId == nil)
    #expect(meetings[1].projectId == "6718d8000000000000000004")
    let quote = try ServerCoding.decoder().decode(QuoteDTO.self, from: json(#"""
    {"_id":"6718d8000000000000000005","reference":"DV-2026-042","project":null,"client":null,"leadId":"6718d8000000000000000002","createdBy":"6718d8000000000000000006","title":"Site vitrine","status":"DRAFT","lines":[],"signature":{"signedAt":null},"firstViewedAt":null,"expiresAt":"2026-11-22T12:00:00.000Z","createdAt":"2026-10-23T12:00:00.000Z","updatedAt":"2026-10-23T12:00:00.000Z"}
    """#)).model
    #expect(quote.project == nil)
    #expect(quote.client == nil)
    #expect(quote.leadId == meetings[0].leadId)
    #expect(quote.reference == "DV-2026-042")
}

@Test func leadPatchWaitsDuringRefreshRateLimit() async throws {
    let store = try database()
    let transport = FakeTransport { request in
        if request.url!.path.hasSuffix("/refresh") { return (429, json(#"{"error":"Trop de tentatives"}"#)) }
        return (401, json(#"{"code":"INVALID_ACCESS_TOKEN"}"#))
    }
    let auth = try await session(transport, store, MemoryTokens(StoredSession(tokens: tokens("old"), user: user, device: device)))
    let scope = try await auth.identity()
    _ = try? await auth.send(auth.request(path: "/api/mobile/today"))
    try await store.enqueue(leadId: "lead", patch: LeadPatch(), scope: scope)
    try await Outbox(session: auth, store: store).drain()
    let write = try #require(try await store.writes(scope: scope).first)
    #expect(write.state == "pending")
    #expect(await transport.paths.filter { $0.hasSuffix("/refresh") }.count == 1)
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

@Test func followUpAndStagePatchesTravelThroughOutbox() async throws {
    let store = try database()
    let requests = Mutex<[URLRequest]>([])
    let transport = FakeTransport { request in
        requests.withLock { $0.append(request) }
        return (200, json(#"{"lead":{"_id":"lead","company":"Atelier","assignedTo":"user"}}"#))
    }
    var writer = user
    writer.permissions.insert("manage_crm")
    let auth = try await session(transport, store, MemoryTokens(StoredSession(tokens: tokens("old"), user: writer, device: device)))
    let scope = try await auth.identity()
    try await store.put(type: "leads", json: json(#"{"_id":"lead","company":"Atelier","assignedTo":"user"}"#), scope: scope)
    let api = LiveVenioAPI(session: auth, store: store)
    await api.setConnected(false)
    let date = DemoClock.date(26, hour: 9)
    _ = try await api.updateLead(id: "lead", patch: LeadPatch(nextActionAt: .set(date)))
    _ = try await api.updateLead(id: "lead", patch: LeadPatch(nextActionAt: .clear))
    _ = try await api.updateLead(id: "lead", patch: LeadPatch(status: .lost, lostReason: "Prix"))
    _ = try await api.updateLead(id: "lead", patch: LeadPatch(status: .qualified, lostReason: "Prix"))
    let queued = try await store.writes(scope: scope)
    #expect(queued.count == 4)
    #expect(requests.withLock { $0.isEmpty })
    try await api.outbox.drain()
    let sent = requests.withLock { $0 }
    #expect(sent.map { $0.value(forHTTPHeaderField: "Idempotency-Key") } == queued.map { $0.id.uuidString })
    let bodies = try sent.map { try ServerCoding.object($0.httpBody!) }
    #expect((bodies[0]["nextActionAt"] as? String).flatMap(ServerCoding.date) == date)
    #expect(bodies[1]["nextActionAt"] is NSNull)
    #expect(bodies[2]["status"] as? String == "LOST")
    #expect(bodies[2]["lostReason"] as? String == "Prix")
    #expect(bodies[2]["nextActionAt"] == nil)
    #expect(bodies[3]["status"] as? String == "QUALIFIED")
    #expect(bodies[3]["lostReason"] == nil)
    #expect(try await store.writes(scope: scope).isEmpty)
}

@Test func lostWithoutReasonIsRejectedBeforeQueueing() async throws {
    let store = try database()
    let transport = FakeTransport { _ in (200, Data()) }
    var writer = user
    writer.permissions.insert("manage_crm")
    let auth = try await session(transport, store, MemoryTokens(StoredSession(tokens: tokens("old"), user: writer, device: device)))
    let scope = try await auth.identity()
    try await store.put(type: "leads", json: json(#"{"_id":"lead","company":"Atelier","assignedTo":"user"}"#), scope: scope)
    let api = LiveVenioAPI(session: auth, store: store)
    await api.setConnected(false)
    await #expect(throws: VenioAPIError(code: "LOST_REASON_REQUIRED")) {
        _ = try await api.updateLead(id: "lead", patch: LeadPatch(status: .lost))
    }
    #expect(try await store.writes(scope: scope).isEmpty)
    #expect(await transport.paths.isEmpty)
}

private func documentDraft() throws -> DocumentDraft {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let url = directory.appendingPathComponent("cahier.txt")
    try Data("Cahier des charges du projet".utf8).write(to: url)
    return DocumentDraft(projectId: "project", title: "Cahier des charges", fileName: "cahier.txt", mimeType: "text/plain", fileURL: url)
}
private let documentRequest: @Sendable (DocumentDraft, AuthSession) throws -> URLRequest = { draft, session in
    var request = try session.request(path: "/fixture-upload", method: "POST", body: Data(contentsOf: draft.fileURL))
    request.setValue(draft.idempotencyKey.uuidString, forHTTPHeaderField: "Idempotency-Key")
    return request
}

@Test func offlineDocumentKeepsDurableFileAndKeyAcrossTransportFailure() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let schema = Schema([SyncedRecord.self, SyncCursor.self, PendingWrite.self])
    let configuration = ModelConfiguration(url: directory.appendingPathComponent("documents.store"))
    let store = SyncStore(modelContainer: try ModelContainer(for: schema, configurations: configuration))
    var writer = user
    writer.role = "ADMIN"
    let keys = Mutex<[String?]>([])
    let transport = FakeTransport { request in
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-access-old")
        let count = keys.withLock { $0.append(request.value(forHTTPHeaderField: "Idempotency-Key")); return $0.count }
        if count == 1 { throw URLError(.timedOut) }
        #expect(request.httpBody == Data("Cahier des charges du projet".utf8))
        return (201, Data())
    }
    let memory = MemoryTokens(StoredSession(tokens: tokens("old"), user: writer, device: device))
    let auth = try await session(transport, store, memory)
    let scope = try await auth.identity()
    try await store.put(type: "projects", json: json(#"{"_id":"project","name":"Projet","client":"client"}"#), scope: scope)
    let api = LiveVenioAPI(session: auth, store: store)
    await api.setConnected(false)
    let draft = try documentDraft()
    defer { try? FileManager.default.removeItem(at: draft.fileURL.deletingLastPathComponent()) }
    let document = try await api.uploadDocument(draft)
    #expect(document.deliveryState == "pending")
    #expect(try await api.documents(projectId: draft.projectId).map(\.id) == [document.id])
    let queued = try #require(try await store.writes(scope: scope).first)
    let saved = try JSONDecoder().decode(DocumentDraft.self, from: queued.payload)
    defer { try? FileManager.default.removeItem(at: saved.fileURL) }
    #expect(queued.type == "document")
    #expect(queued.id == draft.idempotencyKey)
    #expect(saved.idempotencyKey == draft.idempotencyKey)
    #expect(saved.fileURL != draft.fileURL)
    try FileManager.default.removeItem(at: draft.fileURL)
    #expect(try await Data(contentsOf: api.documentFile(id: document.id)) == Data("Cahier des charges du projet".utf8))
    #expect(keys.withLock { $0.isEmpty })
    await api.setConnected(true)
    let outbox = Outbox(session: auth, store: store, makeDocumentRequest: documentRequest)
    try await outbox.drain()
    #expect(try await store.writes(scope: scope).first?.state == "pending")
    #expect(FileManager.default.fileExists(atPath: saved.fileURL.path))
    try await outbox.drain()
    #expect(keys.withLock { $0.count } == 1)
    let restored = SyncStore(modelContainer: try ModelContainer(for: schema, configurations: configuration))
    let reconnected = try await session(transport, restored, memory)
    try await Outbox(session: reconnected, store: restored, makeDocumentRequest: documentRequest).drain()
    #expect(keys.withLock { $0 } == [draft.idempotencyKey.uuidString, draft.idempotencyKey.uuidString])
    #expect(try await restored.writes(scope: reconnected.identity()).isEmpty)
    #expect(!FileManager.default.fileExists(atPath: saved.fileURL.path))
}

@Test func documentIdempotencyPreventsDuplicateQueueAndCompletedReplay() async throws {
    let store = try database()
    let keys = Mutex<[String?]>([])
    let transport = FakeTransport { request in
        keys.withLock { $0.append(request.value(forHTTPHeaderField: "Idempotency-Key")) }
        await Task.yield()
        return (201, Data())
    }
    let auth = try await session(transport, store, MemoryTokens(StoredSession(tokens: tokens("old"), user: user, device: device)))
    let scope = try await auth.identity()
    let draft = try documentDraft()
    defer { try? FileManager.default.removeItem(at: draft.fileURL.deletingLastPathComponent()) }
    _ = try await store.enqueue(draft, scope: scope)
    _ = try await store.enqueue(draft, scope: scope)
    #expect(try await store.writes(scope: scope).count == 1)
    let outbox = Outbox(session: auth, store: store, makeDocumentRequest: documentRequest)
    async let first: Void = outbox.drain()
    async let second: Void = outbox.drain()
    _ = try await (first, second)
    try await store.reset(scope: scope)
    _ = try await store.enqueue(draft, scope: scope)
    try await outbox.drain()
    #expect(try await store.writes(scope: scope).isEmpty)
    #expect(keys.withLock { $0 } == [draft.idempotencyKey.uuidString])
}

@Test func documentDeletionAbandonsPendingFileButRequiresPermissionForConfirmed() async throws {
    let store = try database()
    let transport = FakeTransport { _ in Issue.record("Suppression sans permission : aucun transport attendu"); return (200, Data()) }
    let auth = try await session(transport, store, MemoryTokens(StoredSession(tokens: tokens("old"), user: user, device: device)))
    let scope = try await auth.identity()
    let api = LiveVenioAPI(session: auth, store: store)
    await api.setConnected(false)
    let draft = try documentDraft()
    defer { try? FileManager.default.removeItem(at: draft.fileURL.deletingLastPathComponent()) }
    let pending = try await store.enqueue(draft, scope: scope)
    let saved = try await api.documentFile(id: pending.id)
    try await api.deleteDocument(id: pending.id)
    #expect(try await store.writes(scope: scope).isEmpty)
    #expect(!FileManager.default.fileExists(atPath: saved.path))
    await #expect(throws: VenioAPIError(code: "FORBIDDEN")) { try await api.deleteDocument(id: "confirmed") }
    #expect(await transport.paths.isEmpty)
    let reader = MockVenioAPI(user: user.summary)
    let owner = MockVenioAPI()
    let readerDocuments = try await reader.documents(projectId: "project-pilote")
    let ownerDocuments = try await owner.documents(projectId: "project-pilote")
    var files: [URL] = []
    for document in readerDocuments { files.append(try await reader.documentFile(id: document.id)) }
    for document in ownerDocuments { files.append(try await owner.documentFile(id: document.id)) }
    defer { for file in files { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) } }
    let confirmed = try #require(readerDocuments.first)
    await #expect(throws: VenioAPIError(code: "FORBIDDEN")) { try await reader.deleteDocument(id: confirmed.id) }
    let colleagueDocument = try #require(ownerDocuments.first { $0.uploadedBy != MockVenioAPI.lea.id })
    await #expect(throws: VenioAPIError(code: "FORBIDDEN")) { try await owner.deleteDocument(id: colleagueDocument.id) }
    let ownDocument = try #require(ownerDocuments.first { $0.uploadedBy == MockVenioAPI.lea.id })
    try await owner.deleteDocument(id: ownDocument.id)
    #expect(try await !owner.documents(projectId: "project-pilote").contains { $0.id == ownDocument.id })
}
