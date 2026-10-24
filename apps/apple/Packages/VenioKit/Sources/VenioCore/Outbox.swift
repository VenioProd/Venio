import Foundation

public actor Outbox {
    private let session: AuthSession
    private let store: SyncStore
    private var flight: (id: UUID, scope: UUID, task: Task<Void, any Error>)?
    private var backoffSession: UUID?
    private var retryAfter = Date.distantPast
    var nextRetryAt: Date? { retryAfter > .now ? retryAfter : nil }
    public init(session: AuthSession, store: SyncStore) { self.session = session; self.store = store }

    public func drain() async throws {
        let scope = try await session.identity()
        if let current = flight {
            if current.scope == scope.id { return try await current.task.value }
            _ = try? await current.task.value
            if flight?.id == current.id { flight = nil }
            return try await drain()
        }
        if backoffSession != scope.id { backoffSession = scope.id; retryAfter = .distantPast }
        guard Date.now >= retryAfter else { return }
        let id = UUID()
        let task = Task { try await self.run(scope: scope) }
        flight = (id, scope.id, task)
        defer { if flight?.id == id { flight = nil } }
        try await task.value
    }
    public func retry(id: UUID) async throws {
        try await store.retry(id: id, scope: session.identity())
        retryAfter = .distantPast
        try await drain()
    }
    public func delete(id: UUID) async throws {
        try await store.deleteWrite(id: id, scope: session.identity())
    }
    private func run(scope: SessionIdentity) async throws {
        while let write = try await store.writes(scope: scope).first(where: { $0.state == "pending" }) {
            try Task.checkCancellation()
            if let first = write.firstAttemptAt, Date.now.timeIntervalSince(first) > 23 * 60 * 60 {
                try await store.fail(id: write.id, code: "UNCERTAIN_WRITE", scope: scope)
                continue
            }
            // Le lead visé n'a pas pu être créé (sa création, plus haut dans la file, a échoué) :
            // cette écriture ne peut pas partir, mais elle ne doit pas bloquer les suivantes.
            if try hasLocalLead(write) {
                try await store.fail(id: write.id, code: "LEAD_NOT_CREATED", scope: scope)
                continue
            }
            try await store.attempted(id: write.id, scope: scope)
            do {
                let request = try makeRequest(write)
                let (data, response) = try await session.send(request, scope: scope)
                try HTTPFailure.check(data, response)
                let object = try ServerCoding.object(data)
                let field = write.type == "interaction" ? "interaction" : "lead"
                guard let record = object[field] as? [String: Any] else { throw VenioAPIError(code: "INVALID_RESPONSE") }
                try await store.complete(id: write.id, type: write.type == "interaction" ? "interactions" : "leads",
                                         json: JSONSerialization.data(withJSONObject: record), scope: scope)
            } catch let error as HTTPFailure {
                let retryable = error.status == 429 || (error.status == 409 && error.code == "IDEMPOTENCY_IN_PROGRESS")
                try await store.fail(id: write.id, code: error.code, permanent: !retryable, status: error.status, scope: scope)
                if retryable {
                    retryAfter = .now.addingTimeInterval(max(2, error.retryAfter ?? backoff(write.attempts)))
                    return
                }
            } catch let error as URLError {
                try await store.fail(id: write.id, code: "NETWORK_UNAVAILABLE", permanent: false, scope: scope)
                retryAfter = .now.addingTimeInterval(backoff(write.attempts))
                if error.code == .cancelled { throw error }
                return
            } catch let error as VenioAPIError where error.code == "SIGNED_OUT" {
                return
            } catch let error as VenioAPIError where error.code == "RATE_LIMITED" {
                try await store.release(id: write.id, scope: scope)
                retryAfter = .now.addingTimeInterval(backoff(write.attempts))
                return
            } catch {
                try await store.fail(id: write.id, code: "INVALID_RESPONSE", scope: scope)
                throw error
            }
        }
    }
    private func hasLocalLead(_ write: QueuedWrite) throws -> Bool {
        if write.type == "leadPatch" { return try JSONDecoder().decode(LeadPatchWrite.self, from: write.payload).leadId.hasPrefix("local-") }
        if write.type == "interaction" {
            let draft = try JSONDecoder().decode(InteractionDraft.self, from: write.payload)
            return draft.subjectType == .lead && draft.subjectId.hasPrefix("local-")
        }
        return false
    }
    private func backoff(_ attempts: Int) -> TimeInterval { min(60, pow(2, Double(min(attempts + 1, 6)))) }

    private func makeRequest(_ write: QueuedWrite) throws -> URLRequest {
        if write.type == "leadPatch" {
            let value = try JSONDecoder().decode(LeadPatchWrite.self, from: write.payload)
            var request = try session.request(path: "/api/admin/crm/leads/" + value.leadId, method: "PATCH", body: ServerCoding.encoder().encode(value.patch))
            request.setValue(write.id.uuidString, forHTTPHeaderField: "Idempotency-Key")
            return request
        }
        if write.type == "leadCreate" {
            let value = try JSONDecoder().decode(LeadCreateWrite.self, from: write.payload)
            var request = try session.request(path: "/api/admin/crm/leads", method: "POST", body: ServerCoding.encoder().encode(value.draft))
            request.setValue(write.id.uuidString, forHTTPHeaderField: "Idempotency-Key")
            return request
        }
        let draft = try JSONDecoder().decode(InteractionDraft.self, from: write.payload)
        struct Payload: Encodable {
            var subjectType: InteractionSubject; var subjectId: String; var kind: InteractionDraft.Kind; var body: String
            var lang: String?; var direction: InteractionDirection; var occurredAt: Date; var subject: String?; var endsAt: Date?
        }
        let data = try ServerCoding.encoder().encode(Payload(subjectType: draft.subjectType, subjectId: draft.subjectId,
            kind: draft.kind, body: draft.body, lang: draft.lang, direction: draft.direction, occurredAt: draft.occurredAt, subject: draft.subject, endsAt: draft.kind == .meeting ? draft.endsAt : nil))
        var request = try session.request(path: "/api/mobile/interactions", method: "POST", body: data)
        request.setValue(draft.idempotencyKey.uuidString, forHTTPHeaderField: "Idempotency-Key")
        if let url = draft.audioFileURL, FileManager.default.fileExists(atPath: url.path) {
            let boundary = "venio-" + UUID().uuidString
            var body = Data()
            let fields = try ServerCoding.object(data)
            for key in fields.keys.sorted() {
                guard let value = fields[key] as? String else { continue }
                body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(key)\"\r\n\r\n\(value)\r\n".utf8))
            }
            let mime: String
            switch url.pathExtension.lowercased() {
            case "aac": mime = "audio/aac"
            case "mp3": mime = "audio/mpeg"
            case "mp4": mime = "audio/mp4"
            default: mime = "audio/m4a"
            }
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"note.\(url.pathExtension)\"\r\nContent-Type: \(mime)\r\n\r\n".utf8))
            body.append(try Data(contentsOf: url))
            body.append(Data("\r\n--\(boundary)--\r\n".utf8))
            request.httpBody = body
            request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        }
        return request
    }
}
