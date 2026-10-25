import Foundation

public enum DocumentTransport {
    // À confirmer au contrat : permission d'ajout et type de synchronisation.
    public static let managePermission = ""
    static let syncType: String? = nil

    public static func canManage(_ user: UserSummary) -> Bool {
        user.role == .admin || user.permissions.contains(managePermission)
    }
    public static func makeDocumentRequest(_ draft: DocumentDraft, session: AuthSession) throws -> URLRequest {
        throw VenioAPIError(code: "DOCUMENTS_CONTRACT_PENDING")
    }
    static func decodeDocument(_ data: Data) throws -> ProjectDocument {
        throw VenioAPIError(code: "DOCUMENTS_CONTRACT_PENDING")
    }
    // Objet serveur de la réponse d'upload, à conserver sous syncType après succès.
    static func uploadRecord(_ data: Data) throws -> Data? { nil }
    static func deletionRequest(id: String, session: AuthSession) throws -> URLRequest {
        throw VenioAPIError(code: "DOCUMENTS_CONTRACT_PENDING")
    }
    static func fileRequest(id: String, session: AuthSession) throws -> URLRequest {
        throw VenioAPIError(code: "DOCUMENTS_CONTRACT_PENDING")
    }
}
