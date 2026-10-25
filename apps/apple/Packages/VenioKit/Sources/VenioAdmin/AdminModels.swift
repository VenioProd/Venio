import Foundation

public struct BusinessOverview: Sendable, Equatable {
    public var month: Date
    public var invoicedCents: Int
    public var receivedCents: Int
    public var availableCashCents: Int
    public var overdueInvoices: [OverdueInvoice]
    public var cashIn: [MonthlyAmount]
    public var finance: FinanceTotals

    public init(month: Date, invoicedCents: Int, receivedCents: Int, availableCashCents: Int, overdueInvoices: [OverdueInvoice], cashIn: [MonthlyAmount], finance: FinanceTotals) {
        self.month = month
        self.invoicedCents = invoicedCents
        self.receivedCents = receivedCents
        self.availableCashCents = availableCashCents
        self.overdueInvoices = overdueInvoices
        self.cashIn = cashIn
        self.finance = finance
    }
}

public struct OverdueInvoice: Sendable, Equatable, Identifiable {
    public var id: String
    public var number: String
    public var clientName: String
    public var projectName: String?
    public var remainingCents: Int
    public var dueAt: Date
    public var lastReminderAt: Date?

    public init(id: String, number: String, clientName: String, projectName: String?, remainingCents: Int, dueAt: Date, lastReminderAt: Date?) {
        self.id = id
        self.number = number
        self.clientName = clientName
        self.projectName = projectName
        self.remainingCents = remainingCents
        self.dueAt = dueAt
        self.lastReminderAt = lastReminderAt
    }
}

public struct MonthlyAmount: Sendable, Equatable {
    public var month: Date
    public var amountCents: Int

    public init(month: Date, amountCents: Int) {
        self.month = month
        self.amountCents = amountCents
    }
}

public struct FinanceTotals: Sendable, Equatable {
    public var marginCents: Int
    public var remainingTtcCents: Int
    public var beneficiaries: [BeneficiaryBalance]

    public init(marginCents: Int, remainingTtcCents: Int, beneficiaries: [BeneficiaryBalance]) {
        self.marginCents = marginCents
        self.remainingTtcCents = remainingTtcCents
        self.beneficiaries = beneficiaries
    }
}

public struct BeneficiaryBalance: Sendable, Equatable {
    public var displayName: String
    public var dueCents: Int
    public var paidCents: Int
    public var remainingCents: Int

    public init(displayName: String, dueCents: Int, paidCents: Int, remainingCents: Int) {
        self.displayName = displayName
        self.dueCents = dueCents
        self.paidCents = paidCents
        self.remainingCents = remainingCents
    }
}

public struct AdminProject: Sendable, Equatable, Identifiable {
    public var id: String
    public var projectNumber: String
    public var name: String
    public var clientName: String
    public var status: AdminProjectStatus
    public var endDate: Date?
    public var progress: Int
    /// `nil` quand le montant n'est pas renseigné côté serveur : ce n'est pas un zéro.
    public var budgetCents: Int?
    public var invoicedCents: Int?
    public var currency: String
    public var currentPhase: CurrentPhase?
    public var openChangeRequests: Int

    public init(id: String, projectNumber: String, name: String, clientName: String, status: AdminProjectStatus, endDate: Date?, progress: Int, budgetCents: Int?, invoicedCents: Int?, currency: String = "EUR", currentPhase: CurrentPhase?, openChangeRequests: Int) {
        self.id = id
        self.projectNumber = projectNumber
        self.name = name
        self.clientName = clientName
        self.status = status
        self.endDate = endDate
        self.progress = progress
        self.budgetCents = budgetCents
        self.invoicedCents = invoicedCents
        self.currency = currency
        self.currentPhase = currentPhase
        self.openChangeRequests = openChangeRequests
    }
}

public struct CurrentPhase: Sendable, Equatable {
    public var title: String
    public var rank: Int
    public var total: Int

    public init(title: String, rank: Int, total: Int) {
        self.title = title
        self.rank = rank
        self.total = total
    }
}

public struct AdminProjectDetail: Sendable, Equatable {
    public var project: AdminProject
    public var phases: [AdminPhase]
    public var updates: [ClientUpdate]
    public var items: [ProjectItem]
    public var documents: [ProjectDocument]

    public init(project: AdminProject, phases: [AdminPhase], updates: [ClientUpdate], items: [ProjectItem], documents: [ProjectDocument]) {
        self.project = project
        self.phases = phases
        self.updates = updates
        self.items = items
        self.documents = documents
    }
}

public struct AdminPhase: Sendable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var order: Int
    public var status: AdminPhaseStatus
    public var requiresClientValidation: Bool
    public var dueAt: Date?

    public init(id: String, title: String, order: Int, status: AdminPhaseStatus, requiresClientValidation: Bool, dueAt: Date?) {
        self.id = id
        self.title = title
        self.order = order
        self.status = status
        self.requiresClientValidation = requiresClientValidation
        self.dueAt = dueAt
    }
}

public struct ClientUpdate: Sendable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var body: String
    public var createdAt: Date

    public init(id: String, title: String, body: String, createdAt: Date) {
        self.id = id
        self.title = title
        self.body = body
        self.createdAt = createdAt
    }
}

public struct ProjectItem: Sendable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var type: ProjectItemType
    public var section: String?
    public var status: ProjectItemStatus
    public var isVisible: Bool
    public var isDownloadable: Bool

    public init(id: String, title: String, type: ProjectItemType, section: String?, status: ProjectItemStatus, isVisible: Bool, isDownloadable: Bool) {
        self.id = id
        self.title = title
        self.type = type
        self.section = section
        self.status = status
        self.isVisible = isVisible
        self.isDownloadable = isDownloadable
    }
}

public struct ProjectDocument: Sendable, Equatable, Identifiable {
    public var id: String
    public var type: ProjectDocumentType
    public var originalName: String
    public var uploadedAt: Date

    public init(id: String, type: ProjectDocumentType, originalName: String, uploadedAt: Date) {
        self.id = id
        self.type = type
        self.originalName = originalName
        self.uploadedAt = uploadedAt
    }
}

public struct ChangeRequest: Sendable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var description: String
    public var clientName: String
    public var projectId: String?
    public var projectName: String?
    public var priority: AdminPriority
    public var status: AdminChangeRequestStatus
    public var createdAt: Date

    public init(id: String, title: String, description: String, clientName: String, projectId: String?, projectName: String?, priority: AdminPriority, status: AdminChangeRequestStatus, createdAt: Date) {
        self.id = id
        self.title = title
        self.description = description
        self.clientName = clientName
        self.projectId = projectId
        self.projectName = projectName
        self.priority = priority
        self.status = status
        self.createdAt = createdAt
    }
}

public struct ProjectFinance: Sendable, Equatable {
    public var invoicedHtCents: Int
    public var receivedTtcCents: Int
    public var remainingTtcCents: Int
    public var directCostsCents: Int
    public var marginCents: Int
    public var beneficiaries: [BeneficiaryBalance]
    public var overdueCount: Int

    public init(invoicedHtCents: Int, receivedTtcCents: Int, remainingTtcCents: Int, directCostsCents: Int, marginCents: Int, beneficiaries: [BeneficiaryBalance], overdueCount: Int) {
        self.invoicedHtCents = invoicedHtCents
        self.receivedTtcCents = receivedTtcCents
        self.remainingTtcCents = remainingTtcCents
        self.directCostsCents = directCostsCents
        self.marginCents = marginCents
        self.beneficiaries = beneficiaries
        self.overdueCount = overdueCount
    }
}

public struct Conversation: Sendable, Equatable, Identifiable {
    public var id: String
    public var kind: ConversationKind
    public var title: String
    public var unreadCount: Int
    public var lastMessagePreview: String?
    public var lastMessageAt: Date?

    public init(id: String, kind: ConversationKind, title: String, unreadCount: Int, lastMessagePreview: String?, lastMessageAt: Date?) {
        self.id = id
        self.kind = kind
        self.title = title
        self.unreadCount = unreadCount
        self.lastMessagePreview = lastMessagePreview
        self.lastMessageAt = lastMessageAt
    }
}

public struct Message: Sendable, Equatable, Identifiable {
    public var id: String
    public var senderName: String
    public var senderId: String
    public var content: String
    public var createdAt: Date
    public var isDeleted: Bool

    public init(id: String, senderName: String, senderId: String, content: String, createdAt: Date, isDeleted: Bool) {
        self.id = id
        self.senderName = senderName
        self.senderId = senderId
        self.content = content
        self.createdAt = createdAt
        self.isDeleted = isDeleted
    }
}

public struct ActivitySection: Sendable, Equatable {
    public var key: String
    public var title: String
    public var entries: [ActivityEntry]
    public var hasMore: Bool

    public init(key: String, title: String, entries: [ActivityEntry], hasMore: Bool) {
        self.key = key
        self.title = title
        self.entries = entries
        self.hasMore = hasMore
    }
}

public struct ActivityEntry: Sendable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var meta: String
    public var dueAt: Date?

    public init(id: String, title: String, meta: String, dueAt: Date?) {
        self.id = id
        self.title = title
        self.meta = meta
        self.dueAt = dueAt
    }
}

public struct Ticket: Sendable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var message: String
    public var category: TicketCategory
    public var priority: AdminPriority
    public var status: AdminTicketStatus
    public var authorName: String
    public var projectName: String?
    public var createdAt: Date
    public var replies: [TicketReply]

    public init(id: String, title: String, message: String, category: TicketCategory, priority: AdminPriority, status: AdminTicketStatus, authorName: String, projectName: String?, createdAt: Date, replies: [TicketReply]) {
        self.id = id
        self.title = title
        self.message = message
        self.category = category
        self.priority = priority
        self.status = status
        self.authorName = authorName
        self.projectName = projectName
        self.createdAt = createdAt
        self.replies = replies
    }
}

public struct TicketReply: Sendable, Equatable {
    public var authorId: String
    public var authorName: String
    public var message: String
    public var createdAt: Date

    public init(authorId: String, authorName: String, message: String, createdAt: Date) {
        self.authorId = authorId
        self.authorName = authorName
        self.message = message
        self.createdAt = createdAt
    }
}

public struct DevIssue: Sendable, Equatable, Identifiable {
    public var id: String
    public var identifier: String
    public var title: String
    public var status: DevIssueStatus
    public var priority: DevPriority
    public var projectName: String
    public var assigneeName: String?

    public init(id: String, identifier: String, title: String, status: DevIssueStatus, priority: DevPriority, projectName: String, assigneeName: String?) {
        self.id = id
        self.identifier = identifier
        self.title = title
        self.status = status
        self.priority = priority
        self.projectName = projectName
        self.assigneeName = assigneeName
    }
}

