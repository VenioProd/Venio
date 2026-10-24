import Foundation

public struct BackendConfiguration: Sendable {
    public enum Backend: String, Sendable { case mock, live }
    public let backend: Backend
    public let baseURL: URL

    public init(arguments: [String] = ProcessInfo.processInfo.arguments) throws {
        func value(_ key: String) -> String? {
            guard let index = arguments.firstIndex(of: key), arguments.indices.contains(index + 1) else { return nil }
            return arguments[index + 1]
        }
        #if DEBUG
        let fallback = Backend.mock
        #else
        let fallback = Backend.live
        #endif
        if let selected = value("-VenioBackend") {
            guard let backend = Backend(rawValue: selected) else { throw VenioAPIError(code: "INVALID_BACKEND") }
            self.backend = backend
        } else { backend = fallback }
        let raw = value("-VenioAPIBaseURL") ?? "https://venio.paris"
        guard let url = URL(string: raw), let host = url.host, url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/" else { throw VenioAPIError(code: "INVALID_BASE_URL") }
        if url.scheme == "http" {
            #if DEBUG
            guard ["localhost", "127.0.0.1"].contains(host) else { throw VenioAPIError(code: "INVALID_BASE_URL") }
            #else
            throw VenioAPIError(code: "INVALID_BASE_URL")
            #endif
        } else if url.scheme != "https" { throw VenioAPIError(code: "INVALID_BASE_URL") }
        baseURL = url
    }
}
