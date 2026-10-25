import Foundation

public struct ProjectDocument: Codable, Sendable, Identifiable, Equatable {
    public var id: String
    public var project: String
    public var title: String
    public var fileName: String
    public var mimeType: String
    public var size: Int?
    public var uploadedBy: String
    public var uploadedAt: Date
    public var clientVisible: Bool
    public var deliveryState: String?

    public init(id: String, project: String, title: String, fileName: String, mimeType: String, size: Int?,
                uploadedBy: String, uploadedAt: Date, clientVisible: Bool, deliveryState: String? = nil) {
        self.id = id; self.project = project; self.title = title; self.fileName = fileName
        self.mimeType = mimeType; self.size = size; self.uploadedBy = uploadedBy; self.uploadedAt = uploadedAt
        self.clientVisible = clientVisible; self.deliveryState = deliveryState
    }
    public var pendingKey: UUID? {
        guard deliveryState != nil, id.hasPrefix("pending-") else { return nil }
        return UUID(uuidString: String(id.dropFirst("pending-".count)))
    }
}

public struct DocumentDraft: Codable, Sendable, Equatable, Identifiable {
    public var id: UUID { idempotencyKey }
    public var idempotencyKey: UUID
    public var projectId: String
    public var title: String
    public var fileName: String
    public var mimeType: String
    public var fileURL: URL
    public var clientVisible: Bool

    public init(idempotencyKey: UUID = UUID(), projectId: String, title: String, fileName: String,
                mimeType: String, fileURL: URL, clientVisible: Bool = false) {
        self.idempotencyKey = idempotencyKey; self.projectId = projectId; self.title = title
        self.fileName = fileName; self.mimeType = mimeType; self.fileURL = fileURL; self.clientVisible = clientVisible
    }
    func model(state: String?, userId: String, date: Date) -> ProjectDocument {
        ProjectDocument(id: "pending-" + idempotencyKey.uuidString, project: projectId, title: title,
            fileName: fileName, mimeType: mimeType,
            size: (try? fileURL.resourceValues(forKeys: [.fileSizeKey]))?.fileSize,
            uploadedBy: userId, uploadedAt: date, clientVisible: clientVisible, deliveryState: state)
    }
}
