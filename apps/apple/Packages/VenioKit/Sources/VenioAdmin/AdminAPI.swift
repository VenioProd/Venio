import Foundation
import VenioCore

public protocol AdminAPI: Sendable {
    func businessOverview() async throws -> BusinessOverview
    func remindInvoice(id: String) async throws -> OverdueInvoice
    func projects() async throws -> [AdminProject]
    func projectDetail(id: String) async throws -> AdminProjectDetail
    func transitionPhase(projectId: String, phaseId: String, action: PhaseAction) async throws -> AdminPhase
    func publishUpdate(projectId: String, title: String, body: String) async throws -> ClientUpdate
    func setItemVisibility(projectId: String, itemId: String, visible: Bool) async throws -> ProjectItem
    func changeRequests() async throws -> [ChangeRequest]
    func triage(changeRequestId: String, action: TriageAction) async throws -> ChangeRequest
    func projectFinance(projectId: String) async throws -> ProjectFinance
    func conversations() async throws -> [Conversation]
    func messages(conversationId: String) async throws -> [Message]
    func sendMessage(conversationId: String, content: String) async throws -> Message
    func markRead(conversationId: String) async throws
    func activity() async throws -> [ActivitySection]
    func tickets() async throws -> [Ticket]
    func replyTicket(id: String, message: String) async throws -> Ticket
    func setTicketStatus(id: String, status: AdminTicketStatus) async throws -> Ticket
    func devIssues() async throws -> [DevIssue]
    func setDevIssueStatus(id: String, status: DevIssueStatus) async throws -> DevIssue
}

public enum AdminAPIError: Error, Sendable, Equatable {
    case forbidden, webOnly, conflict(String), notFound, connectionRequired, invalidInput, other

    /// La requête a pu aboutir sans que la réponse arrive.
    public var isUncertain: Bool { self == .connectionRequired || self == .other }

    public init(_ error: any Error) {
        if let error = error as? Self { self = error; return }
        if let error = error as? HTTPFailure {
            switch error.status {
            case 403:
                self = ["BROWSER_SESSION_REQUIRED", "MFA_STEP_UP_REQUIRED"].contains(error.code) ? .webOnly : .forbidden
            case 404: self = .notFound
            case 409 where error.code != "HTTP_409": self = .conflict(error.code)
            case 400, 422: self = .invalidInput
            default: self = .other
            }
            return
        }
        if let error = error as? VenioAPIError {
            switch error.code {
            case "CONNECTION_REQUIRED": self = .connectionRequired
            case "FORBIDDEN", "SIGNED_OUT": self = .forbidden
            case "NOT_FOUND": self = .notFound
            case "INVALID_INPUT": self = .invalidInput
            default: self = .other
            }
            return
        }
        self = .other
    }
}
