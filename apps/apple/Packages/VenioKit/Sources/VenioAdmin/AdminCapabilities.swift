import Foundation

public enum AdminSection: String, CaseIterable, Sendable {
    case business, projects, messaging, activity, tickets, dev

    public static func available(for permissions: Set<String>) -> [Self] {
        allCases.filter { section in
            switch section {
            case .business: !permissions.isDisjoint(with: ["view_billing", "view_accounting"])
            case .projects: permissions.contains("view_projects")
            case .messaging: permissions.contains("view_messaging")
            case .activity: true
            case .tickets: permissions.contains("view_tickets")
            case .dev: permissions.contains("view_dev")
            }
        }
    }
}

public struct AdminCapabilities: Sendable {
    private let permissions: Set<String>
    private let isSuperAdmin: Bool
    public init(permissions: Set<String>, isSuperAdmin: Bool) {
        self.permissions = permissions
        self.isSuperAdmin = isSuperAdmin
    }
    public var canRemindInvoices: Bool { permissions.contains("manage_billing") }
    public var canManagePhases: Bool { permissions.contains("manage_phases") }
    public var canPublishUpdates: Bool { permissions.contains("edit_projects") }
    public var canToggleVisibility: Bool { permissions.contains("edit_content") }
    public var canTriage: Bool { permissions.contains("manage_change_requests") }
    public var canQuote: Bool { canTriage && permissions.contains("manage_billing") }
    public var canViewProjectFinance: Bool { permissions.contains("view_accounting") }
    public var canSendMessages: Bool { permissions.contains("send_messages") }
    /// Le serveur refuse réponse et statut à tout autre rôle que SUPER_ADMIN, même avec la permission.
    public var canManageTickets: Bool { isSuperAdmin && permissions.contains("manage_tickets") }
    public var canManageDev: Bool { permissions.contains("manage_dev") }
}
