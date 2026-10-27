import Foundation
import Security

public protocol TokenStore: Sendable {
    func load() throws -> StoredSession?
    func save(_ session: StoredSession) throws
    func clear() throws
    func installationID() throws -> UUID
}

public struct KeychainTokenStore: TokenStore {
    private let service: String
    public init(service: String = "paris.venio.mobile") { self.service = service }

    public func load() throws -> StoredSession? {
        guard let data = try read("session") else { return nil }
        return try JSONDecoder().decode(StoredSession.self, from: data)
    }
    public func save(_ session: StoredSession) throws { try write(JSONEncoder().encode(session), account: "session") }
    public func clear() throws {
        let status = SecItemDelete(query("session") as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainFailure(status: status) }
    }
    public func installationID() throws -> UUID {
        if let data = try read("installation"), let id = try? JSONDecoder().decode(UUID.self, from: data) { return id }
        let id = UUID()
        try write(JSONEncoder().encode(id), account: "installation")
        return id
    }
    private func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: account, kSecAttrSynchronizable as String: false]
    }
    private func read(_ account: String) throws -> Data? {
        var attributes = query(account)
        attributes[kSecReturnData as String] = true
        attributes[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(attributes as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw KeychainFailure(status: status) }
        return data
    }
    private func write(_ data: Data, account: String) throws {
        let changes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(query(account) as CFDictionary, changes as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(query(account).merging(changes) { _, new in new } as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw KeychainFailure(status: status) }
    }
}
public struct KeychainFailure: Error, Sendable { public let status: OSStatus }
