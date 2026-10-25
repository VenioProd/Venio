import Foundation
import SwiftData

@Model public final class SyncedRecord {
    #Unique<SyncedRecord>([\.type, \.id])
    public var type: String
    public var id: String
    public var json: Data
    public var updatedAt: Date
    public init(type: String, id: String, json: Data, updatedAt: Date) {
        self.type = type; self.id = id; self.json = json; self.updatedAt = updatedAt
    }
}
@Model public final class SyncCursor {
    @Attribute(.unique) public var type: String
    public var cursor: String?
    public init(type: String, cursor: String?) { self.type = type; self.cursor = cursor }
}
@Model public final class PendingWrite {
    @Attribute(.unique) public var id: UUID
    public var type: String
    public var payload: Data
    public var createdAt: Date
    public var attempts: Int
    public var firstAttemptAt: Date?
    public var lastStatus: Int?
    public var state: String
    public var lastError: String?
    public init(id: UUID, type: String, payload: Data, createdAt: Date) {
        self.id = id; self.type = type; self.payload = payload; self.createdAt = createdAt
        attempts = 0; state = "pending"
    }
}
public struct QueuedWrite: Sendable, Identifiable {
    public let id: UUID
    public let type: String
    public let payload: Data
    public let createdAt: Date
    public let attempts: Int
    public let firstAttemptAt: Date?
    public let lastStatus: Int?
    public let state: String
    public let lastError: String?
}
struct LeadCreateWrite: Codable, Sendable {
    var localId: String
    var draft: LeadDraft
    var createdAt: Date
    func model(state: String, userId: String) -> Lead {
        var lead = Lead(id: localId, company: draft.company, contactName: draft.contactName,
                        contactEmail: draft.contactEmail, contactPhone: draft.contactPhone, source: draft.source,
                        status: .lead, budget: draft.budget, nextActionAt: nil, serviceType: draft.serviceType,
                        leadTemperature: .warm, assignedTo: draft.assignedTo ?? userId, score: nil,
                        notes: draft.notes, createdAt: createdAt)
        lead.deliveryState = state
        return lead
    }
}
struct LeadPatchWrite: Codable, Sendable { var leadId: String; var patch: LeadPatch }
struct SyncPageInfo: Decodable, Sendable { var nextCursor: String?; var hasMore: Bool }

@ModelActor public actor SyncStore {
    private var activeSession: UUID?
    private let memoryCacheID = UUID().uuidString

    public func activate(_ scope: SessionIdentity) throws {
        modelContext.autosaveEnabled = false
        do {
            let owner = try cursorRecord("__owner")
            if owner?.cursor != scope.user.id {
                guard try modelContext.fetchCount(FetchDescriptor<PendingWrite>()) == 0 else {
                    throw VenioAPIError(code: "PENDING_WRITES_OTHER_ACCOUNT")
                }
                try clearSynced()
                try clearDocumentReceipts()
                try clearWrites()
                if let owner { owner.cursor = scope.user.id }
                else { modelContext.insert(SyncCursor(type: "__owner", cursor: scope.user.id)) }
            }
            try modelContext.save()
            activeSession = scope.id
        } catch { modelContext.rollback(); throw error }
    }
    public func deactivate(sessionID: UUID, discardWrites: Bool) throws {
        guard activeSession == sessionID else { return }
        activeSession = nil
        if discardWrites {
            do {
                try clearSynced()
                try clearDocumentReceipts()
                try clearWrites()
                if let owner = try cursorRecord("__owner") { modelContext.delete(owner) }
                try modelContext.save()
            } catch { modelContext.rollback(); throw error }
        }
    }
    private func check(_ scope: SessionIdentity) throws {
        guard activeSession == scope.id else { throw VenioAPIError(code: "SIGNED_OUT") }
    }
    private func cursorRecord(_ type: String) throws -> SyncCursor? {
        try modelContext.fetch(FetchDescriptor<SyncCursor>(predicate: #Predicate { $0.type == type })).first
    }
    public func cursor(type: String, scope: SessionIdentity) throws -> String? {
        try check(scope)
        return try cursorRecord(type)?.cursor
    }
    public func records(type: String, scope: SessionIdentity) throws -> [Data] {
        try check(scope)
        return try modelContext.fetch(FetchDescriptor<SyncedRecord>(predicate: #Predicate { $0.type == type }, sortBy: [SortDescriptor(\.id)])).map(\.json)
    }
    public func put(type: String, json: Data, scope: SessionIdentity) throws {
        try check(scope)
        do { try upsert(type: type, object: ServerCoding.object(json)); try modelContext.save() }
        catch { modelContext.rollback(); throw error }
    }
    func applyPage(type: String, data: Data, scope: SessionIdentity) throws -> SyncPageInfo {
        try check(scope)
        let info = try ServerCoding.decoder().decode(SyncPageInfo.self, from: data)
        let page = try ServerCoding.object(data)
        guard let items = page["items"] as? [[String: Any]] else { throw VenioAPIError(code: "INVALID_RESPONSE") }
        do {
            for item in items {
                if type == "deletions" {
                    guard let entityType = item["entityType"] as? String, let entityID = item["entityId"] as? String else { throw VenioAPIError(code: "INVALID_RESPONSE") }
                    try remove(type: entityType, id: entityID)
                } else { try upsert(type: type, object: item) }
            }
            if let cursor = try cursorRecord(type) { cursor.cursor = info.nextCursor }
            else { modelContext.insert(SyncCursor(type: type, cursor: info.nextCursor)) }
            try modelContext.save()
            return info
        } catch { modelContext.rollback(); throw error }
    }
    private func upsert(type: String, object: [String: Any]) throws {
        guard let id = ServerCoding.reference(object), !id.isEmpty else { throw VenioAPIError(code: "INVALID_RESPONSE") }
        let json = try JSONSerialization.data(withJSONObject: object)
        let date = (object["updatedAt"] as? String).flatMap(ServerCoding.date)
            ?? (object["occurredAt"] as? String).flatMap(ServerCoding.date) ?? .distantPast
        let existing = try modelContext.fetch(FetchDescriptor<SyncedRecord>(predicate: #Predicate { $0.type == type && $0.id == id })).first
        if let existing {
            if existing.updatedAt <= date { existing.json = json; existing.updatedAt = date }
        }
        else { modelContext.insert(SyncedRecord(type: type, id: id, json: json, updatedAt: date)) }
    }
    private func remove(type: String, id: String) throws {
        for record in try modelContext.fetch(FetchDescriptor<SyncedRecord>(predicate: #Predicate { $0.type == type && $0.id == id })) { modelContext.delete(record) }
        if type == DocumentTransport.syncType {
            try? FileManager.default.removeItem(at: documentCacheDirectory.appendingPathComponent(id, isDirectory: true))
        }
        if type == "projects" {
            for childType in ["projectPhases", "projectUpdates", DocumentTransport.syncType] {
                let children = try modelContext.fetch(FetchDescriptor<SyncedRecord>(predicate: #Predicate { $0.type == childType }))
                for child in children where try ServerCoding.reference(ServerCoding.object(child.json)["project"]) == id {
                    try remove(type: childType, id: child.id)
                }
            }
        }
    }
    public func reset(scope: SessionIdentity) throws {
        try check(scope)
        do { try clearSynced(); try modelContext.save() }
        catch { modelContext.rollback(); throw error }
    }
    private func clearSynced() throws {
        try? FileManager.default.removeItem(at: documentCacheDirectory)
        try modelContext.delete(model: SyncedRecord.self)
        for cursor in try modelContext.fetch(FetchDescriptor<SyncCursor>()) where cursor.type != "__owner" && !cursor.type.hasPrefix("__documentReceipt:") { modelContext.delete(cursor) }
    }
    private func clearDocumentReceipts() throws {
        for cursor in try modelContext.fetch(FetchDescriptor<SyncCursor>()) where cursor.type.hasPrefix("__documentReceipt:") { modelContext.delete(cursor) }
    }
    private func clearWrites() throws {
        for write in try modelContext.fetch(FetchDescriptor<PendingWrite>()) {
            removeFile(write)
            modelContext.delete(write)
        }
    }
    public func writes(scope: SessionIdentity) throws -> [QueuedWrite] {
        try check(scope)
        return try modelContext.fetch(FetchDescriptor<PendingWrite>(sortBy: [SortDescriptor(\.createdAt), SortDescriptor(\.id)])).map(snapshot)
    }
    private func snapshot(_ write: PendingWrite) -> QueuedWrite {
        QueuedWrite(id: write.id, type: write.type, payload: write.payload, createdAt: write.createdAt,
                    attempts: write.attempts, firstAttemptAt: write.firstAttemptAt, lastStatus: write.lastStatus, state: write.state, lastError: write.lastError)
    }
    public func enqueue(_ draft: InteractionDraft, scope: SessionIdentity) throws -> QueuedWrite {
        try check(scope)
        var normalized = draft
        if normalized.subjectType == .lead { normalized.subjectId = try resolvedLeadId(normalized.subjectId, scope: scope) }
        if let previous = try write(draft.idempotencyKey) {
            let saved = try JSONDecoder().decode(InteractionDraft.self, from: previous.payload)
            normalized.audioFileURL = saved.audioFileURL
            guard normalized == saved else { throw VenioAPIError(code: "IDEMPOTENCY_CONFLICT") }
            return snapshot(previous)
        }
        var saved = normalized
        var copied: URL?
        if let source = draft.audioFileURL, FileManager.default.fileExists(atPath: source.path) {
            let directory = Self.audioDirectory
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let destination = directory.appendingPathComponent(draft.idempotencyKey.uuidString).appendingPathExtension(source.pathExtension)
            try FileManager.default.copyItem(at: source, to: destination)
            saved.audioFileURL = destination
            copied = destination
        }
        do {
            let record = PendingWrite(id: draft.idempotencyKey, type: "interaction", payload: try JSONEncoder().encode(saved), createdAt: .now)
            modelContext.insert(record)
            try modelContext.save()
            return snapshot(record)
        } catch {
            modelContext.rollback()
            if let copied { try? FileManager.default.removeItem(at: copied) }
            throw error
        }
    }
    public func enqueue(_ draft: DocumentDraft, scope: SessionIdentity) throws -> ProjectDocument {
        try check(scope)
        if let receipt = try cursorRecord("__documentReceipt:" + draft.idempotencyKey.uuidString)?.cursor,
           let data = Data(base64Encoded: receipt) {
            let saved = try JSONDecoder().decode(DocumentReceipt.self, from: data)
            var normalized = draft
            normalized.fileURL = saved.draft.fileURL
            guard normalized == saved.draft else { throw VenioAPIError(code: "IDEMPOTENCY_CONFLICT") }
            return saved.document
        }
        if let previous = try write(draft.idempotencyKey) {
            guard previous.type == "document" else { throw VenioAPIError(code: "IDEMPOTENCY_CONFLICT") }
            let saved = try JSONDecoder().decode(DocumentDraft.self, from: previous.payload)
            var normalized = draft
            normalized.fileURL = saved.fileURL
            guard normalized == saved else { throw VenioAPIError(code: "IDEMPOTENCY_CONFLICT") }
            return resolvedDocument(saved).model(state: previous.state, userId: scope.user.id, date: previous.createdAt)
        }
        let access = draft.fileURL.startAccessingSecurityScopedResource()
        defer { if access { draft.fileURL.stopAccessingSecurityScopedResource() } }
        try DocumentTransport.validateFile(draft)
        try FileManager.default.createDirectory(at: documentDirectory, withIntermediateDirectories: true)
        let destination = documentDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension(draft.fileURL.pathExtension)
        try FileManager.default.copyItem(at: draft.fileURL, to: destination)
        var saved = draft
        saved.fileURL = URL(string: destination.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._")))!)!
        do {
            let record = PendingWrite(id: draft.idempotencyKey, type: "document", payload: try JSONEncoder().encode(saved), createdAt: .now)
            modelContext.insert(record)
            try modelContext.save()
            return resolvedDocument(saved).model(state: record.state, userId: scope.user.id, date: record.createdAt)
        } catch {
            modelContext.rollback()
            try? FileManager.default.removeItem(at: destination)
            throw error
        }
    }
    func completeDocument(id: UUID, record: Data?, scope: SessionIdentity) throws {
        try check(scope)
        guard let write = try write(id), write.type == "document" else { return }
        let draft = try JSONDecoder().decode(DocumentDraft.self, from: write.payload)
        var document = resolvedDocument(draft).model(state: nil, userId: scope.user.id, date: write.createdAt)
        do {
            if let record {
                document = try DocumentTransport.decodeDocument(record)
                try upsert(type: DocumentTransport.syncType, object: ServerCoding.object(record))
            }
            let receipt = DocumentReceipt(draft: draft, document: document)
            modelContext.insert(SyncCursor(type: "__documentReceipt:" + id.uuidString, cursor: try JSONEncoder().encode(receipt).base64EncodedString()))
            modelContext.delete(write)
            try modelContext.save()
            try? FileManager.default.removeItem(at: resolvedDocument(draft).fileURL)
        } catch { modelContext.rollback(); throw error }
    }
    func removeDocument(id: String, scope: SessionIdentity) throws {
        try check(scope)
        do { try remove(type: DocumentTransport.syncType, id: id); try modelContext.save() }
        catch { modelContext.rollback(); throw error }
    }
    func documentDraft(_ payload: Data, scope: SessionIdentity) throws -> DocumentDraft {
        try check(scope)
        return try resolvedDocument(JSONDecoder().decode(DocumentDraft.self, from: payload))
    }
    private func resolvedDocument(_ draft: DocumentDraft) -> DocumentDraft {
        var draft = draft
        draft.fileURL = documentDirectory.appendingPathComponent(draft.fileURL.lastPathComponent)
        return draft
    }
    func documentCacheURL(_ document: ProjectDocument, scope: SessionIdentity) throws -> URL {
        try check(scope)
        return try documentCacheDirectory.appendingPathComponent(document.id, isDirectory: true)
            .appendingPathComponent(URL(fileURLWithPath: document.fileName).lastPathComponent)
    }
    private var documentCacheDirectory: URL {
        get throws {
            let configuration = modelContainer.configurations.first!
            let namespace = configuration.isStoredInMemoryOnly ? memoryCacheID : configuration.name
            return FileManager.default.temporaryDirectory.appendingPathComponent("VenioPreviews", isDirectory: true)
                .appendingPathComponent(namespace, isDirectory: true)
                .appendingPathComponent(try cursorRecord("__owner")?.cursor ?? "", isDirectory: true)
        }
    }
    private struct DocumentReceipt: Codable { var draft: DocumentDraft; var document: ProjectDocument }
    private var documentDirectory: URL {
        let configuration = modelContainer.configurations.first!
        let root = configuration.isStoredInMemoryOnly ? FileManager.default.temporaryDirectory.appendingPathComponent("Venio") : configuration.url.deletingLastPathComponent()
        return root.appendingPathComponent("Outbox/Documents", isDirectory: true)
    }
    func enqueue(leadId: String, patch: LeadPatch, scope: SessionIdentity) throws {
        try check(scope)
        try patch.validate()
        do {
            modelContext.insert(PendingWrite(id: UUID(), type: "leadPatch", payload: try JSONEncoder().encode(LeadPatchWrite(leadId: resolvedLeadId(leadId, scope: scope), patch: patch)), createdAt: .now))
            try modelContext.save()
        } catch { modelContext.rollback(); throw error }
    }
    func enqueue(_ draft: LeadDraft, scope: SessionIdentity) throws -> Lead {
        try check(scope)
        let key = UUID()
        let value = LeadCreateWrite(localId: "local-" + UUID().uuidString.lowercased(), draft: draft, createdAt: .now)
        do {
            modelContext.insert(PendingWrite(id: key, type: "leadCreate", payload: try JSONEncoder().encode(value), createdAt: value.createdAt))
            try modelContext.save()
            return value.model(state: "pending", userId: scope.user.id)
        } catch { modelContext.rollback(); throw error }
    }
    func resolvedLeadId(_ id: String, scope: SessionIdentity) throws -> String {
        try check(scope)
        return try cursorRecord("leadId:" + id)?.cursor ?? id
    }
    private func write(_ id: UUID) throws -> PendingWrite? {
        try modelContext.fetch(FetchDescriptor<PendingWrite>(predicate: #Predicate { $0.id == id })).first
    }
    @discardableResult func attempted(id: UUID, scope: SessionIdentity) throws -> Bool {
        try check(scope)
        do {
            guard let write = try write(id) else { return false }
            write.attempts += 1
            if write.firstAttemptAt == nil { write.firstAttemptAt = .now }
            try modelContext.save()
            return true
        } catch { modelContext.rollback(); throw error }
    }
    func release(id: UUID, scope: SessionIdentity) throws {
        try check(scope)
        do { if let write = try write(id) { write.state = "pending" }; try modelContext.save() }
        catch { modelContext.rollback(); throw error }
    }
    func fail(id: UUID, code: String, permanent: Bool = true, status: Int? = nil, scope: SessionIdentity) throws {
        try check(scope)
        do {
            if let write = try write(id) { write.state = permanent ? "failed" : "pending"; write.lastError = code; write.lastStatus = status }
            try modelContext.save()
        } catch { modelContext.rollback(); throw error }
    }
    func complete(id: UUID, type: String, json: Data, scope: SessionIdentity) throws {
        try check(scope)
        guard let write = try write(id) else { return }
        do {
            try upsert(type: type, object: ServerCoding.object(json))
            if write.type == "leadCreate" {
                let value = try JSONDecoder().decode(LeadCreateWrite.self, from: write.payload)
                guard let realId = ServerCoding.reference(try ServerCoding.object(json)) else { throw VenioAPIError(code: "INVALID_RESPONSE") }
                modelContext.insert(SyncCursor(type: "leadId:" + value.localId, cursor: realId))
                for queued in try modelContext.fetch(FetchDescriptor<PendingWrite>()) {
                    if queued.type == "interaction" {
                        var draft = try JSONDecoder().decode(InteractionDraft.self, from: queued.payload)
                        if draft.subjectType == .lead && draft.subjectId == value.localId {
                            draft.subjectId = realId
                            queued.payload = try JSONEncoder().encode(draft)
                        }
                    } else if queued.type == "leadPatch" {
                        var patch = try JSONDecoder().decode(LeadPatchWrite.self, from: queued.payload)
                        if patch.leadId == value.localId {
                            patch.leadId = realId
                            queued.payload = try JSONEncoder().encode(patch)
                        }
                    }
                }
            }
            let audio = fileURL(write)
            modelContext.delete(write)
            try modelContext.save()
            if let audio { try? FileManager.default.removeItem(at: audio) }
        } catch { modelContext.rollback(); throw error }
    }
    public func retry(id: UUID, scope: SessionIdentity) throws {
        try check(scope)
        do {
            if let write = try write(id), write.state == "failed" {
                let key = UUID()
                if write.type == "interaction" {
                    var draft = try JSONDecoder().decode(InteractionDraft.self, from: write.payload)
                    draft.idempotencyKey = key
                    write.payload = try JSONEncoder().encode(draft)
                }
                if write.type == "document" {
                    var draft = try JSONDecoder().decode(DocumentDraft.self, from: write.payload)
                    draft.idempotencyKey = key
                    write.payload = try JSONEncoder().encode(draft)
                }
                write.id = key
                write.state = "pending"
                write.lastError = nil
                write.lastStatus = nil
                write.firstAttemptAt = nil
                write.attempts = 0
            }
            try modelContext.save()
        } catch { modelContext.rollback(); throw error }
    }
    public func deleteWrite(id: UUID, scope: SessionIdentity) throws {
        try check(scope)
        guard let write = try write(id) else { return }
        do { let audio = fileURL(write); modelContext.delete(write); try modelContext.save(); if let audio { try? FileManager.default.removeItem(at: audio) } }
        catch { modelContext.rollback(); throw error }
    }
    private static var audioDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Venio/Outbox", isDirectory: true)
    }
    private func removeFile(_ write: PendingWrite) {
        if let url = fileURL(write) { try? FileManager.default.removeItem(at: url) }
    }
    private func fileURL(_ write: PendingWrite) -> URL? {
        if write.type == "document", let draft = try? JSONDecoder().decode(DocumentDraft.self, from: write.payload) {
            return resolvedDocument(draft).fileURL
        }
        guard write.type == "interaction", let draft = try? JSONDecoder().decode(InteractionDraft.self, from: write.payload),
              let url = draft.audioFileURL, url.deletingLastPathComponent().standardizedFileURL == Self.audioDirectory.standardizedFileURL else { return nil }
        return url
    }
}
