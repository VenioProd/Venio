import Foundation
import SwiftData
import Synchronization
import Testing
import VenioAdmin
@testable import VenioCore

@Test func businessFiguresAndMoney() async throws {
    let api = MockAdminAPI()
    let overview = try await api.businessOverview()
    let figures = BusinessFigures(overview: overview)
    #expect(figures.receivedPercent == 82)
    #expect(figures.overdueCents == 745000)
    #expect(overview.overdueInvoices.map { figures.overdueDays(for: $0) } == [12, 27, 41])
    #expect(figures.cumulativeCashIn.last?.amountCents == 19510000)
    #expect(figures.clock.calendar.component(.month, from: try #require(figures.bestMonth).month) == 9)
    #expect(figures.previousMonthVariationPercent == -24)
    func spaces(_ text: String) -> String { text.replacingOccurrences(of: "\u{202f}", with: " ").replacingOccurrences(of: "\u{a0}", with: " ") }
    #expect(spaces(AdminFormats(locale: Locale(identifier: "fr")).money(4125000)) == "41 250 €")
    #expect(AdminFormats(locale: Locale(identifier: "en")).money(4125000) == "€41,250")
    #expect(spaces(AdminFormats(locale: Locale(identifier: "fr")).money(125)) == "1,25 €")
}

@Test func sectionsFollowPermissions() {
    #expect(AdminSection.available(for: MockAdminAPI.demoUser.permissions) == AdminSection.allCases)
    let accountant: Set<String> = ["view_billing", "view_accounting", "view_projects", "view_messaging", "send_messages"]
    #expect(AdminSection.available(for: accountant) == [.business, .projects, .messaging, .activity])
    let capabilities = AdminCapabilities(permissions: accountant)
    #expect(capabilities.canViewProjectFinance && !capabilities.canPublishUpdates && !capabilities.canManagePhases)
    #expect(AdminSection.available(for: ["view_projects"]) == [.projects, .activity])
}

@Test func mockTriageTransitionsAndPermissions() async throws {
    let api = MockAdminAPI()
    let submitted = try #require(try await api.changeRequests().first { $0.status == .submitted })
    await #expect(throws: AdminAPIError.conflict("INVALID_TRANSITION")) {
        _ = try await api.triage(changeRequestId: submitted.id, action: .start)
    }
    #expect(try await api.triage(changeRequestId: submitted.id, action: .refuse(reason: "Hors périmètre")).status == .refused)
    var user = MockAdminAPI.demoUser
    user.permissions.remove("manage_billing")
    let restricted = MockAdminAPI(user: user)
    await #expect(throws: AdminAPIError.forbidden) {
        _ = try await restricted.triage(changeRequestId: submitted.id, action: .quote(projectId: "project-morel"))
    }
}

private final class MemoryTokens: TokenStore {
    private let value: Mutex<StoredSession?>
    init(_ session: StoredSession) { value = Mutex(session) }
    func load() throws -> StoredSession? { value.withLock { $0 } }
    func save(_ session: StoredSession) throws { value.withLock { $0 = session } }
    func clear() throws { value.withLock { $0 = nil } }
    func installationID() throws -> UUID { UUID() }
}
private actor AdminTransport: HTTPTransport {
    private(set) var calls = 0
    var browserRequired = false
    func requireBrowser() { browserRequired = true }
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        calls += 1
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-access")
        let status: Int
        let body: String
        if browserRequired {
            status = 403
            body = #"{"code":"BROWSER_SESSION_REQUIRED"}"#
        } else {
            status = 200
            switch request.url!.path {
            case "/api/admin/projects":
                #expect(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first?.value == "true")
                body = #"{"projects":[{"_id":"project","projectNumber":"P-1","name":"Réservation","client":{"_id":"client","name":"Agence"},"status":"EN_COURS","endDate":"2026-11-28T00:00:00.000Z","budget":{"amount":18400.25},"billing":{"amountInvoiced":9200},"isArchived":false}]}"#
            case "/api/admin/projects/project/phases":
                body = #"{"phases":[{"_id":"one","title":"Cadrage","order":0,"status":"TERMINEE","requiresClientValidation":false},{"_id":"two","title":"Conception","order":1,"status":"EN_COURS","requiresClientValidation":true},{"_id":"three","title":"Développement","order":2,"status":"FUTURE_STATUS","requiresClientValidation":false}]}"#
            case "/api/admin/tickets":
                body = #"[{"_id":"ticket","title":"Paiement","message":"À vérifier","category":"PROBLEME","priority":"NEW_PRIORITY","status":"OUVERT","authorName":"Camille","project":"project","createdAt":"2026-10-23T07:41:00Z","replies":[{"authorId":"user","authorName":"Raphaël","message":"Je regarde","createdAt":"2026-10-23T08:00:00.000Z"}]}]"#
            default:
                Issue.record("Requête inattendue")
                body = "{}"
            }
        }
        return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}

@Test func liveProjectsTicketsAndWebOnly() async throws {
    let transport = AdminTransport()
    let schema = Schema([SyncedRecord.self, SyncCursor.self, PendingWrite.self])
    let store = SyncStore(modelContainer: try ModelContainer(for: schema, configurations: ModelConfiguration(isStoredInMemoryOnly: true)))
    let user = MobileUser(id: "user", name: "Raphaël", email: "test@example.invalid", role: "SUPER_ADMIN", permissions: ["view_projects", "view_phases", "view_tickets"])
    let tokens = TokenPair(accessToken: "fixture-access", accessTokenExpiresAt: .distantFuture, refreshToken: "fixture-refresh", refreshTokenExpiresAt: .distantFuture)
    let device = Device(id: "device", name: "Test", platform: "macos", model: "Mac", osVersion: "27", appVersion: "1", createdAt: .distantPast, lastSeenAt: .distantPast, expiresAt: .distantFuture, pushEnabled: false, current: true)
    let session = try AuthSession(baseURL: URL(string: "https://transport.invalid")!, transport: transport,
        tokenStore: MemoryTokens(StoredSession(tokens: tokens, user: user, device: device)),
        deviceInfo: DeviceInfo(platform: "macos", name: "Test", model: "Mac", osVersion: "27", appVersion: "1"), dataStore: store)
    try await session.restore()
    let api = LiveAdminAPI(session: session)
    await #expect(throws: AdminAPIError.webOnly) { _ = try await api.businessOverview() }
    #expect(await transport.calls == 0)
    let project = try #require(try await api.projects().first)
    #expect(project.clientName == "Agence" && project.budgetCents == 1840025 && project.invoicedCents == 920000)
    #expect(project.progress == 33 && project.currentPhase?.rank == 2)
    let ticket = try #require(try await api.tickets().first)
    #expect(ticket.status == .open && ticket.priority == .unknown && ticket.replies.count == 1)
    #expect(ticket.replies.first?.message == "Je regarde" && ticket.projectName == nil)
    await transport.requireBrowser()
    await #expect(throws: AdminAPIError.webOnly) { _ = try await api.tickets() }
}
