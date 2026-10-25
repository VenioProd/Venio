import Foundation

extension AuthSession {
    public func data(for request: URLRequest, scope: SessionIdentity) async throws -> Data {
        do {
            let (data, response) = try await send(request, scope: scope)
            try HTTPFailure.check(data, response)
            return data
        } catch let error as URLError {
            if error.code == .cancelled { throw error }
            throw VenioAPIError(code: "CONNECTION_REQUIRED")
        }
    }
}
