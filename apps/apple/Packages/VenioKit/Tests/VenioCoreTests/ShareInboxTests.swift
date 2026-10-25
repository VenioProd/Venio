import Foundation
import SwiftData
import Testing
@testable import VenioCore

@Suite struct ShareInboxTests {
    private func directory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
    private func fixture(_ directory: URL, userId: String = "user", mimeType: String = "text/plain") throws -> (ShareInboxItem, URL) {
        let file = directory.appendingPathComponent("cahier.txt")
        try Data("Cahier du projet".utf8).write(to: file)
        return (ShareInboxItem(origin: "https://venio.invalid", userId: userId, projectId: "project",
            title: "Cahier", fileName: "cahier.txt", mimeType: mimeType), file)
    }
    private func database() async throws -> (SyncStore, SessionIdentity) {
        let container = try ModelContainer(for: SyncedRecord.self, SyncCursor.self, PendingWrite.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        let store = SyncStore(modelContainer: container)
        let scope = SessionIdentity(id: UUID(), user: MobileUser(id: "user", name: "Test", email: "test@example.invalid",
            role: "COMMERCIAL", permissions: ["upload_project_documents"]))
        try await store.activate(scope)
        return (store, scope)
    }

    @Test func depositRoundTripAndInterruptedDeposit() throws {
        let directory = try directory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = ShareInboxStore(directory: directory)
        let (item, file) = try fixture(directory)
        try inbox.add(item: item, copying: file)
        let interrupted = directory.appendingPathComponent("ShareInbox").appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: interrupted, withIntermediateDirectories: true)
        let old = directory.appendingPathComponent("ShareInbox").appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: old, withIntermediateDirectories: true)
        try FileManager.default.setAttributes([.creationDate: Date.now.addingTimeInterval(-7200)], ofItemAtPath: old.path)
        let saved = try #require(try inbox.items().first)
        #expect(try inbox.items().count == 1)
        #expect(saved.idempotencyKey == item.idempotencyKey)
        #expect(saved.title == item.title && saved.projectId == item.projectId)
        #expect(try Data(contentsOf: inbox.fileURL(for: saved)) == Data(contentsOf: file))
        #expect(FileManager.default.fileExists(atPath: interrupted.path))
        #expect(!FileManager.default.fileExists(atPath: old.path))
    }

    @Test func repeatedImportKeepsOneQueuedWriteAndKey() async throws {
        let directory = try directory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = ShareInboxStore(directory: directory)
        let (item, file) = try fixture(directory)
        let (store, scope) = try await database()
        try inbox.add(item: item, copying: file)
        await #expect(throws: CocoaError(.fileWriteUnknown)) {
            try await inbox.importItem(item, origin: item.origin, userId: "user") { draft in
                _ = try await store.enqueue(draft, scope: scope)
                throw CocoaError(.fileWriteUnknown)
            }
        }
        #expect(try inbox.items().count == 1)
        try await inbox.importItem(item, origin: item.origin, userId: "user") { draft in
            _ = try await store.enqueue(draft, scope: scope)
        }
        let writes = try await store.writes(scope: scope)
        #expect(writes.count == 1)
        let write = try #require(writes.first)
        #expect(write.id == item.idempotencyKey)
        #expect(try JSONDecoder().decode(DocumentDraft.self, from: write.payload).idempotencyKey == item.idempotencyKey)
        #expect(try inbox.items().isEmpty)
        try await store.deactivate(sessionID: scope.id, discardWrites: true)
    }

    @Test func otherAccountIsKeptWithoutEnqueue() async throws {
        let directory = try directory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = ShareInboxStore(directory: directory)
        let (item, file) = try fixture(directory, userId: "other")
        let (store, scope) = try await database()
        try inbox.add(item: item, copying: file)
        #expect(try await !inbox.importItem(item, origin: "https://another.invalid", userId: "user") { _ in
            Issue.record("Une autre origine ne doit pas être importée")
        })
        #expect(try inbox.items().count == 1)
        try await inbox.importItem(item, origin: item.origin, userId: "user") { draft in
            Issue.record("Un autre utilisateur ne doit pas être importé")
            _ = try await store.enqueue(draft, scope: scope)
        }
        #expect(try inbox.items().count == 1)
        #expect(try await store.writes(scope: scope).isEmpty)
    }

    @Test func unsupportedTypeIsRejectedBeforeDeposit() throws {
        let directory = try directory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = ShareInboxStore(directory: directory)
        let (item, file) = try fixture(directory, mimeType: "application/x-executable")
        #expect(throws: VenioAPIError(code: "UNSUPPORTED_MEDIA_TYPE")) { try inbox.add(item: item, copying: file) }
        #expect(try inbox.items().isEmpty)
    }
}
