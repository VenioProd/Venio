import Foundation

public struct TokenPair: Codable, Sendable {
    public var accessToken: String
    public var accessTokenExpiresAt: Date
    public var refreshToken: String
    public var refreshTokenExpiresAt: Date
}

public struct MobileUser: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var email: String
    public var role: String
    public var permissions: Set<String>

    public var summary: UserSummary {
        UserSummary(id: id, name: name, initials: name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined(),
                    role: role == "COMMERCIAL" ? .commercial : .admin, permissions: permissions)
    }
}

public struct Device: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var platform: String
    public var model: String
    public var osVersion: String
    public var appVersion: String
    public var createdAt: Date
    public var lastSeenAt: Date
    public var expiresAt: Date
    public var pushEnabled: Bool
    public var current: Bool
}

public struct DeviceInfo: Codable, Sendable {
    public var platform: String
    public var name: String
    public var model: String
    public var osVersion: String
    public var appVersion: String
    public var installationId: UUID?

    public init(platform: String, name: String, model: String, osVersion: String, appVersion: String) {
        self.platform = platform
        self.name = String(name.prefix(100))
        self.model = String(model.prefix(40))
        self.osVersion = String(osVersion.prefix(40))
        self.appVersion = String(appVersion.prefix(40))
    }
}

public struct StoredSession: Codable, Sendable {
    public var tokens: TokenPair
    public var user: MobileUser
    public var device: Device
    public var rotationPending: Bool

    public init(tokens: TokenPair, user: MobileUser, device: Device, rotationPending: Bool = false) {
        self.tokens = tokens; self.user = user; self.device = device; self.rotationPending = rotationPending
    }
    private enum CodingKeys: String, CodingKey { case tokens, user, device, rotationPending }
    public init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        tokens = try values.decode(TokenPair.self, forKey: .tokens)
        user = try values.decode(MobileUser.self, forKey: .user)
        device = try values.decode(Device.self, forKey: .device)
        rotationPending = try values.decodeIfPresent(Bool.self, forKey: .rotationPending) ?? false
    }
}

public enum LoginOutcome: Sendable { case requiresSecondFactor, signedIn(MobileUser, Device) }
public enum SessionState: Sendable, Equatable { case signedOut, signedIn(MobileUser, Device) }

public struct SessionIdentity: Sendable, Equatable {
    public let id: UUID
    public let user: MobileUser
}

public enum LoginFailure: Error, Sendable {
    case credentials, secondFactor, disabled, roleNotAllowed, mfaSetupRequired, rateLimited, validation
}

public struct HTTPFailure: Error, Sendable {
    public let status: Int
    public let code: String
    public let retryAfter: TimeInterval?

    static func check(_ data: Data, _ response: HTTPURLResponse) throws {
        guard (200..<300).contains(response.statusCode) else { throw Self(data: data, response: response) }
    }
    init(data: Data, response: HTTPURLResponse) {
        status = response.statusCode
        code = (try? JSONDecoder().decode(ErrorBody.self, from: data).code) ?? "HTTP_\(status)"
        retryAfter = response.value(forHTTPHeaderField: "Retry-After").flatMap(Double.init)
            ?? response.value(forHTTPHeaderField: "RateLimit-Reset").flatMap(Double.init)
    }
    private struct ErrorBody: Decodable { var code: String? }
}
