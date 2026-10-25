import Foundation

public enum DocumentTransport {
    public static let managePermission = "upload_project_documents"
    static let syncType = "projectDocuments"
    private static let maximumFileSize = 20 * 1024 * 1024
    private static let allowedMIMETypes: Set<String> = [
        "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/heic", "image/heif",
        "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain", "text/csv", "application/zip", "application/x-zip-compressed", "video/mp4", "video/quicktime",
        "video/webm", "audio/mpeg", "audio/wav", "audio/ogg", "application/json"
    ]

    public static func canManage(_ user: UserSummary) -> Bool {
        !user.permissions.isDisjoint(with: [managePermission, "edit_content"])
    }
    static func validateFile(_ draft: DocumentDraft) throws {
        guard allowedMIMETypes.contains(draft.mimeType) else { throw VenioAPIError(code: "UNSUPPORTED_MEDIA_TYPE") }
        let size = try draft.fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize
        guard let size, size <= maximumFileSize else { throw VenioAPIError(code: "FILE_TOO_LARGE") }
    }
    public static func makeDocumentRequest(_ draft: DocumentDraft, session: AuthSession) throws -> URLRequest {
        try validateFile(draft)
        let file = try FileHandle(forReadingFrom: draft.fileURL)
        defer { try? file.close() }
        let data = try file.read(upToCount: maximumFileSize + 1) ?? Data()
        guard data.count <= maximumFileSize else { throw VenioAPIError(code: "FILE_TOO_LARGE") }
        let boundary = UUID().uuidString
        var body = Data()
        for (name, value) in [("title", draft.title), ("type", "AUTRE"), ("isVisible", draft.clientVisible ? "true" : "false")] {
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
        }
        let fileName = draft.fileName.replacingOccurrences(of: "\\", with: "%5C")
            .replacingOccurrences(of: "\"", with: "%22").replacingOccurrences(of: "\r", with: "").replacingOccurrences(of: "\n", with: "")
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\nContent-Type: \(draft.mimeType)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        var request = try session.request(path: "/api/admin/projects/\(draft.projectId)/items", method: "POST", body: body)
        request.setValue(draft.idempotencyKey.uuidString, forHTTPHeaderField: "Idempotency-Key")
        request.setValue("multipart/form-data; boundary=" + boundary, forHTTPHeaderField: "Content-Type")
        return request
    }
    static func decodeDocument(_ data: Data) throws -> ProjectDocument {
        try ServerCoding.decoder().decode(ProjectDocumentDTO.self, from: data).model
    }
    static func uploadRecord(_ data: Data) throws -> Data? {
        guard let object = try? ServerCoding.object(data), let item = object["item"] as? [String: Any] else { return nil }
        let record = try JSONSerialization.data(withJSONObject: item)
        guard (try? decodeDocument(record)) != nil else { return nil }
        return record
    }
    static func deletionRequest(id: String, projectId: String, session: AuthSession) throws -> URLRequest {
        try session.request(path: "/api/admin/projects/\(projectId)/items/\(id)", method: "DELETE")
    }
    static func fileRequest(id: String, projectId: String, session: AuthSession) throws -> URLRequest {
        try session.request(path: "/api/admin/projects/\(projectId)/items/\(id)/download")
    }
}
