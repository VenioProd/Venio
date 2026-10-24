import Foundation

public actor AuthSession {
    public nonisolated let baseURL: URL
    private let transport: any HTTPTransport
    private let tokenStore: any TokenStore
    private let dataStore: SyncStore
    private let deviceInfo: DeviceInfo
    private var stored: StoredSession?
    private var generation = UUID()
    private var ready = false
    private var loggingOut = false
    private var authenticating = false
    private var refreshTask: (id: UUID, task: Task<Void, any Error>)?
    private var refreshAllowedAt = Date.distantPast
    private var observers: [UUID: AsyncStream<SessionState>.Continuation] = [:]
    public private(set) var state: SessionState = .signedOut

    public init(baseURL: URL, transport: any HTTPTransport, tokenStore: any TokenStore, deviceInfo: DeviceInfo, dataStore: SyncStore) throws {
        guard let scheme = baseURL.scheme, ["https", "http"].contains(scheme), baseURL.host != nil,
              baseURL.user == nil, baseURL.password == nil else { throw VenioAPIError(code: "INVALID_BASE_URL") }
        self.baseURL = baseURL
        self.transport = transport
        self.tokenStore = tokenStore
        self.dataStore = dataStore
        var info = deviceInfo
        info.installationId = try tokenStore.installationID()
        self.deviceInfo = info
        stored = try tokenStore.load()
        if stored?.rotationPending == true {
            stored = nil
            try tokenStore.clear()
        }
    }

    public func states() -> AsyncStream<SessionState> {
        let id = UUID()
        let (stream, continuation) = AsyncStream<SessionState>.makeStream()
        observers[id] = continuation
        continuation.yield(state)
        continuation.onTermination = { [weak self] _ in Task { await self?.removeObserver(id) } }
        return stream
    }
    private func removeObserver(_ id: UUID) { observers[id] = nil }
    private func publish(_ state: SessionState) {
        self.state = state
        observers.values.forEach { $0.yield(state) }
    }

    public func restore() async throws {
        guard !ready, let stored else { return }
        let expected = generation
        try await dataStore.activate(SessionIdentity(id: expected, user: stored.user))
        guard generation == expected, self.stored != nil else { throw VenioAPIError(code: "SIGNED_OUT") }
        ready = true
        publish(.signedIn(stored.user, stored.device))
    }
    public func identity() throws -> SessionIdentity {
        guard ready, !loggingOut, let stored else { throw VenioAPIError(code: "SIGNED_OUT") }
        return SessionIdentity(id: generation, user: stored.user)
    }

    public func login(email: String, password: String, totpCode: String? = nil, recoveryCode: String? = nil) async throws -> LoginOutcome {
        guard !authenticating, stored == nil else { throw VenioAPIError(code: "SESSION_BUSY") }
        authenticating = true
        defer { authenticating = false }
        let expected = generation
        struct LoginBody: Encodable { var email: String; var password: String; var totpCode: String?; var recoveryCode: String?; var device: DeviceInfo }
        let request = try request(path: "/api/auth/mobile/login", method: "POST", body: ServerCoding.encoder().encode(
            LoginBody(email: email, password: password, totpCode: totpCode, recoveryCode: recoveryCode, device: deviceInfo)))
        let (data, response) = try await transport.send(request)
        guard generation == expected else { throw CancellationError() }
        switch response.statusCode {
        case 400: throw LoginFailure.validation
        case 401: throw (totpCode != nil || recoveryCode != nil) ? LoginFailure.secondFactor : LoginFailure.credentials
        case 403:
            switch HTTPFailure(data: data, response: response).code {
            case "MOBILE_ROLE_NOT_ALLOWED": throw LoginFailure.roleNotAllowed
            case "MFA_SETUP_REQUIRED": throw LoginFailure.mfaSetupRequired
            default: throw LoginFailure.disabled
            }
        case 429: throw LoginFailure.rateLimited
        default: try HTTPFailure.check(data, response)
        }
        struct Challenge: Decodable { var requires2FA: Bool? }
        if try ServerCoding.decoder().decode(Challenge.self, from: data).requires2FA == true { return .requiresSecondFactor }
        struct Response: Decodable { var user: MobileUser; var device: Device }
        let result = try ServerCoding.decoder().decode(Response.self, from: data)
        let pair = try ServerCoding.decoder().decode(TokenPair.self, from: data)
        let session = StoredSession(tokens: pair, user: result.user, device: result.device)
        do {
            try tokenStore.save(session)
            stored = session
            try await dataStore.activate(SessionIdentity(id: expected, user: result.user))
            guard generation == expected else { throw CancellationError() }
            ready = true
            publish(.signedIn(result.user, result.device))
        } catch {
            if generation == expected { try await disconnect(discardWrites: false) }
            if let request = try? self.request(path: "/api/auth/mobile/logout", method: "POST", body: JSONEncoder().encode(["refreshToken": pair.refreshToken])) {
                _ = try? await transport.send(request)
            }
            throw error
        }
        return .signedIn(result.user, result.device)
    }

    public nonisolated func request(path: String, method: String = "GET", query: [URLQueryItem] = [], body: Data? = nil) throws -> URLRequest {
        var url = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        url.path = path
        url.queryItems = query.isEmpty ? nil : query
        url.fragment = nil
        guard let target = url.url else { throw VenioAPIError(code: "INVALID_URL") }
        var request = URLRequest(url: target)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        return request
    }

    public func send(_ request: URLRequest, scope expected: SessionIdentity? = nil) async throws -> (Data, HTTPURLResponse) {
        guard request.url?.scheme == baseURL.scheme, request.url?.host == baseURL.host,
              request.url?.port == baseURL.port else { throw VenioAPIError(code: "INVALID_URL") }
        let scope = try identity()
        if let expected, scope.id != expected.id { throw VenioAPIError(code: "SIGNED_OUT") }
        guard let refused = stored?.tokens.accessToken else { throw VenioAPIError(code: "SIGNED_OUT") }
        var authorized = request
        authorized.setValue("Bearer " + refused, forHTTPHeaderField: "Authorization")
        let first = try await transport.send(authorized)
        try check(scope)
        guard first.1.statusCode == 401 else { return first }
        if stored?.tokens.accessToken == refused { try await refresh() }
        try check(scope)
        guard let access = stored?.tokens.accessToken else { throw VenioAPIError(code: "SIGNED_OUT") }
        authorized.setValue("Bearer " + access, forHTTPHeaderField: "Authorization")
        let replay = try await transport.send(authorized)
        try check(scope)
        if replay.1.statusCode == 401 {
            try await disconnect(discardWrites: false)
            throw VenioAPIError(code: "SIGNED_OUT")
        }
        return replay
    }

    private func check(_ scope: SessionIdentity) throws {
        guard ready, !loggingOut, stored != nil, generation == scope.id else { throw VenioAPIError(code: "SIGNED_OUT") }
    }
    private func refresh() async throws {
        if let refreshTask { return try await refreshTask.task.value }
        guard Date.now >= refreshAllowedAt else { throw VenioAPIError(code: "RATE_LIMITED") }
        let scope = try identity()
        guard let token = stored?.tokens.refreshToken else { throw VenioAPIError(code: "SIGNED_OUT") }
        let id = UUID()
        let task = Task { try await self.rotate(token, scope: scope) }
        refreshTask = (id, task)
        defer { if refreshTask?.id == id { refreshTask = nil } }
        try await task.value
    }
    private func rotate(_ token: String, scope: SessionIdentity) async throws {
        let request = try request(path: "/api/auth/mobile/refresh", method: "POST", body: JSONEncoder().encode(["refreshToken": token]))
        try await setRotationPending(true)
        let data: Data
        let response: HTTPURLResponse
        do { (data, response) = try await transport.send(request) }
        catch {
            try check(scope)
            if requestCertainlyNotSent(error) { try await setRotationPending(false) }
            else { try await disconnect(discardWrites: false) }
            throw error
        }
        try check(scope)
        if response.statusCode == 401 {
            try await disconnect(discardWrites: false)
            throw VenioAPIError(code: "SIGNED_OUT")
        }
        if response.statusCode == 400 || response.statusCode == 429 {
            let failure = HTTPFailure(data: data, response: response)
            if response.statusCode == 429 { refreshAllowedAt = .now.addingTimeInterval(max(0, failure.retryAfter ?? 60)) }
            try await setRotationPending(false)
            throw failure
        }
        do {
            guard response.statusCode == 200 else { throw HTTPFailure(data: data, response: response) }
            let pair = try ServerCoding.decoder().decode(TokenPair.self, from: data)
            guard var updated = stored else { throw VenioAPIError(code: "SIGNED_OUT") }
            updated.tokens = pair
            updated.rotationPending = false
            try tokenStore.save(updated)
            stored = updated
        } catch {
            try await disconnect(discardWrites: false)
            throw error
        }
    }
    private func setRotationPending(_ value: Bool) async throws {
        guard var updated = stored else { throw VenioAPIError(code: "SIGNED_OUT") }
        updated.rotationPending = value
        do { try tokenStore.save(updated); stored = updated }
        catch { try await disconnect(discardWrites: false); throw error }
    }

    public func devices() async throws -> [Device] {
        let (data, response) = try await send(request(path: "/api/auth/mobile/devices"))
        try HTTPFailure.check(data, response)
        struct Response: Decodable { var devices: [Device] }
        return try ServerCoding.decoder().decode(Response.self, from: data).devices
    }
    public func revokeDevice(id: String) async throws {
        let current = stored?.device.id == id
        let (data, response) = try await send(request(path: "/api/auth/mobile/devices/" + id, method: "DELETE"))
        try HTTPFailure.check(data, response)
        if current { try await disconnect(discardWrites: true) }
    }
    public func revokeAllOtherDevices() async throws {
        let (data, response) = try await send(request(path: "/api/auth/mobile/devices/revoke-all", method: "POST"))
        try HTTPFailure.check(data, response)
    }
    public func logout() async throws {
        guard !loggingOut else { return }
        loggingOut = true
        refreshTask?.task.cancel()
        if let token = stored?.tokens.refreshToken {
            let request = try request(path: "/api/auth/mobile/logout", method: "POST", body: JSONEncoder().encode(["refreshToken": token]))
            _ = try? await transport.send(request)
        }
        try await disconnect(discardWrites: true)
    }
    private func disconnect(discardWrites: Bool) async throws {
        guard stored != nil || discardWrites else { return }
        let previous = generation
        generation = UUID()
        stored = nil
        ready = false
        refreshAllowedAt = .distantPast
        loggingOut = false
        refreshTask?.task.cancel()
        refreshTask = nil
        publish(.signedOut)
        var failure: (any Error)?
        do { try tokenStore.clear() } catch { failure = error }
        do { try await dataStore.deactivate(sessionID: previous, discardWrites: discardWrites) } catch { failure = failure ?? error }
        if let failure { throw failure }
    }
}
