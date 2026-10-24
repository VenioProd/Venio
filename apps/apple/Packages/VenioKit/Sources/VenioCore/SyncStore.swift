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
    public let state: String
    public let lastError: String?
}
struct LeadPatchWrite: Codable, Sendable { var leadId: String; var patch: LeadPatch }
struct SyncPageInfo: Decodable, Sendable { var nextCursor: String?; var hasMore: Bool }

@ModelActor public actor SyncStore {
    private var activeSession: UUID?

    public func activate(_ scope: SessionIdentity) throws {
        modelContext.autosaveEnabled = false
        do {
            let owner = try cursorRecord("__owner")
            if owner?.cursor != scope.user.id {
                guard try modelContext.fetchCount(FetchDescriptor<PendingWrite>()) == 0 else {
                    throw VenioAPIError(code: "PENDING_WRITES_OTHER_ACCOUNT")
                }
                try clearSynced()
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
        if type == "projects" {
            for childType in ["projectPhases", "projectUpdates"] {
                let children = try modelContext.fetch(FetchDescriptor<SyncedRecord>(predicate: #Predicate { $0.type == childType }))
                for child in children where try ServerCoding.reference(ServerCoding.object(child.json)["project"]) == id { modelContext.delete(child) }
            }
        }
    }
    public func reset(scope: SessionIdentity) throws {
        try check(scope)
        do { try clearSynced(); try modelContext.save() }
        catch { modelContext.rollback(); throw error }
    }
    private func clearSynced() throws {
        try modelContext.delete(model: SyncedRecord.self)
        for cursor in try modelContext.fetch(FetchDescriptor<SyncCursor>()) where cursor.type != "__owner" { modelContext.delete(cursor) }
    }
    private func clearWrites() throws {
        for write in try modelContext.fetch(FetchDescriptor<PendingWrite>()) {
            removeAudio(write)
            modelContext.delete(write)
        }
    }
    public func writes(scope: SessionIdentity) throws -> [QueuedWrite] {
        try check(scope)
        return try modelContext.fetch(FetchDescriptor<PendingWrite>(sortBy: [SortDescriptor(\.createdAt), SortDescriptor(\.id)])).map(snapshot)
    }
    private func snapshot(_ write: PendingWrite) -> QueuedWrite {
        QueuedWrite(id: write.id, type: write.type, payload: write.payload, createdAt: write.createdAt,
                    attempts: write.attempts, state: write.state, lastError: write.lastError)
    }
    public func enqueue(_ draft: InteractionDraft, scope: SessionIdentity) throws -> QueuedWrite {
        try check(scope)
        if let previous = try write(draft.idempotencyKey) {
            var normalized = draft
            let saved = try JSONDecoder().decode(InteractionDraft.self, from: previous.payload)
            normalized.audioFileURL = saved.audioFileURL
            guard normalized == saved else { throw VenioAPIError(code: "IDEMPOTENCY_CONFLICT") }
            return snapshot(previous)
        }
        var saved = draft
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
    func enqueue(leadId: String, patch: LeadPatch, scope: SessionIdentity) throws {
        try check(scope)
        do {
            modelContext.insert(PendingWrite(id: UUID(), type: "leadPatch", payload: try JSONEncoder().encode(LeadPatchWrite(leadId: leadId, patch: patch)), createdAt: .now))
            try modelContext.save()
        } catch { modelContext.rollback(); throw error }
    }
    private func write(_ id: UUID) throws -> PendingWrite? {
        try modelContext.fetch(FetchDescriptor<PendingWrite>(predicate: #Predicate { $0.id == id })).first
    }
    func attempted(id: UUID, scope: SessionIdentity) throws {
        try check(scope)
        do { if let write = try write(id) { write.attempts += 1 }; try modelContext.save() }
        catch { modelContext.rollback(); throw error }
    }
    func fail(id: UUID, code: String, permanent: Bool = true, scope: SessionIdentity) throws {
        try check(scope)
        do {
            if let write = try write(id) { if permanent { write.state = "failed" }; write.lastError = code }
            try modelContext.save()
        } catch { modelContext.rollback(); throw error }
    }
    func complete(id: UUID, type: String, json: Data, scope: SessionIdentity) throws {
        try check(scope)
        guard let write = try write(id) else { return }
        do {
            try upsert(type: type, object: ServerCoding.object(json))
            let audio = audioURL(write)
            modelContext.delete(write)
            try modelContext.save()
            if let audio { try? FileManager.default.removeItem(at: audio) }
        } catch { modelContext.rollback(); throw error }
    }
    public func retry(id: UUID, scope: SessionIdentity) throws {
        try check(scope)
        do {
            if let write = try write(id) { write.state = "pending"; write.lastError = nil }
            try modelContext.save()
        } catch { modelContext.rollback(); throw error }
    }
    public func deleteWrite(id: UUID, scope: SessionIdentity) throws {
        try check(scope)
        guard let write = try write(id) else { return }
        do { let audio = audioURL(write); modelContext.delete(write); try modelContext.save(); if let audio { try? FileManager.default.removeItem(at: audio) } }
        catch { modelContext.rollback(); throw error }
    }
    private static var audioDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Venio/Outbox", isDirectory: true)
    }
    private func removeAudio(_ write: PendingWrite) {
        if let url = audioURL(write) { try? FileManager.default.removeItem(at: url) }
    }
    private func audioURL(_ write: PendingWrite) -> URL? {
        guard write.type == "interaction", let draft = try? JSONDecoder().decode(InteractionDraft.self, from: write.payload),
              let url = draft.audioFileURL, url.deletingLastPathComponent().standardizedFileURL == Self.audioDirectory.standardizedFileURL else { return nil }
        return url
    }
}
