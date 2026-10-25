import Foundation

public struct ShareProject: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var client: String
    public var projectNumber: String

    public init(id: String, name: String, client: String, projectNumber: String) {
        self.id = id; self.name = name; self.client = client; self.projectNumber = projectNumber
    }
}

public struct ShareContext: Codable, Sendable, Equatable {
    public var origin: String
    public var userId: String
    public var projects: [ShareProject]
    public var requiresUnlock: Bool
    public var updatedAt: Date

    public init(origin: String, userId: String, projects: [ShareProject], requiresUnlock: Bool, updatedAt: Date = .now) {
        self.origin = origin; self.userId = userId; self.projects = projects
        self.requiresUnlock = requiresUnlock; self.updatedAt = updatedAt
    }
}

public struct ShareInboxItem: Codable, Sendable, Identifiable {
    public var id: UUID { idempotencyKey }
    public var idempotencyKey: UUID
    public var origin: String
    public var userId: String
    public var projectId: String
    public var title: String
    public var fileName: String
    public var mimeType: String
    public var createdAt: Date

    public init(idempotencyKey: UUID = UUID(), origin: String, userId: String, projectId: String,
                title: String, fileName: String, mimeType: String, createdAt: Date = .now) {
        self.idempotencyKey = idempotencyKey; self.origin = origin; self.userId = userId
        self.projectId = projectId; self.title = title; self.fileName = fileName
        self.mimeType = mimeType; self.createdAt = createdAt
    }
    public func draft(fileURL: URL) -> DocumentDraft {
        DocumentDraft(idempotencyKey: idempotencyKey, projectId: projectId, title: title,
                      fileName: fileName, mimeType: mimeType, fileURL: fileURL)
    }
}

public struct ShareInboxStore: Sendable {
    public static let notificationName = "paris.venio.app.share-inbox"
    private let directory: URL?

    public init() {
        directory = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: WidgetSnapshotStore.groupID)
    }
    public init(directory: URL) { self.directory = directory }

    private func root() throws -> URL {
        guard let directory else { throw CocoaError(.fileNoSuchFile) }
        return directory
    }
    private func inbox() throws -> URL { try root().appendingPathComponent("ShareInbox", isDirectory: true) }
    private func folder(_ key: UUID) throws -> URL { try inbox().appendingPathComponent(key.uuidString, isDirectory: true) }
    private func prepare(_ url: URL) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        try protect(url)
    }
    private func protect(_ url: URL) throws {
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
        #endif
    }
    public func writeContext(_ context: ShareContext) throws {
        let root = try root()
        try prepare(root)
        let url = root.appendingPathComponent("share-context.json")
        try JSONEncoder().encode(context).write(to: url, options: .atomic)
        try protect(url)
    }
    public func readContext() -> ShareContext? {
        guard let url = try? root().appendingPathComponent("share-context.json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(ShareContext.self, from: data)
    }
    public func clearContext() throws {
        let url = try root().appendingPathComponent("share-context.json")
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }
    public func fileURL(for item: ShareInboxItem) throws -> URL {
        try folder(item.idempotencyKey).appendingPathComponent("file")
    }
    public func add(item: ShareInboxItem, copying source: URL) throws {
        try stage(item: item, copying: source)
        do { try commit(item: item) }
        catch { try? remove(item.idempotencyKey); throw error }
    }
    public func stage(item: ShareInboxItem, copying source: URL) throws {
        try DocumentTransport.validateFile(item.draft(fileURL: source))
        let folder = try folder(item.idempotencyKey)
        try prepare(try inbox())
        try prepare(folder)
        do {
            let file = try fileURL(for: item)
            try FileManager.default.copyItem(at: source, to: file)
            try protect(file)
            try DocumentTransport.validateFile(item.draft(fileURL: file))
        } catch {
            try? FileManager.default.removeItem(at: folder)
            throw error
        }
    }
    public func commit(item: ShareInboxItem) throws {
        try DocumentTransport.validateFile(item.draft(fileURL: fileURL(for: item)))
        let metadata = try folder(item.idempotencyKey).appendingPathComponent("item.json")
        try JSONEncoder().encode(item).write(to: metadata, options: .atomic)
        // Le dépôt est publié dès l'écriture : un échec de protection ne doit pas le faire passer pour non déposé.
        try? protect(metadata)
    }
    public func items() throws -> [ShareInboxItem] {
        let inbox = try inbox()
        guard FileManager.default.fileExists(atPath: inbox.path) else { return [] }
        let folders = try FileManager.default.contentsOfDirectory(at: inbox, includingPropertiesForKeys: [.creationDateKey])
        var result: [ShareInboxItem] = []
        for folder in folders {
            let metadata = folder.appendingPathComponent("item.json")
            if !FileManager.default.fileExists(atPath: metadata.path) {
                if let date = try folder.resourceValues(forKeys: [.creationDateKey]).creationDate,
                   date < Date.now.addingTimeInterval(-3600) { try FileManager.default.removeItem(at: folder) }
                continue
            }
            guard let data = try? Data(contentsOf: metadata) else { continue }
            guard let item = try? JSONDecoder().decode(ShareInboxItem.self, from: data),
                  item.idempotencyKey.uuidString == folder.lastPathComponent else {
                try? FileManager.default.removeItem(at: folder)
                continue
            }
            result.append(item)
        }
        return result.sorted { $0.createdAt < $1.createdAt }
    }
    public func remove(_ key: UUID) throws {
        let folder = try folder(key)
        if FileManager.default.fileExists(atPath: folder.path) { try FileManager.default.removeItem(at: folder) }
    }
    public func removeAll(origin: String) throws {
        for item in try items() where item.origin == origin { try remove(item.idempotencyKey) }
    }
    @discardableResult public func importItem(_ item: ShareInboxItem, origin: String, userId: String,
        enqueue: @Sendable (DocumentDraft) async throws -> Void) async throws -> Bool {
        // Un dépôt d'un autre compte ou d'une autre origine attend son compte ; la déconnexion explicite vide la boîte.
        guard item.origin == origin, item.userId == userId else { return false }
        do { try await enqueue(item.draft(fileURL: fileURL(for: item))) }
        catch {
            if let code = (error as? VenioAPIError)?.code,
               ["FORBIDDEN", "PROJECT_OUT_OF_SCOPE", "UNSUPPORTED_MEDIA_TYPE", "FILE_TOO_LARGE", "INVALID_INPUT"].contains(code) {
                try remove(item.idempotencyKey)
            } else if let error = error as? CocoaError, error.code == .fileReadNoSuchFile {
                try remove(item.idempotencyKey)
            }
            throw error
        }
        try remove(item.idempotencyKey)
        return true
    }
}
