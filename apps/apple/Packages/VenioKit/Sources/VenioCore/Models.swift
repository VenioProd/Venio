import Foundation

public enum UserRole: String, Codable, Sendable, CaseIterable {
    case admin = "ADMIN"
    case commercial = "COMMERCIAL"
}

public enum LeadStage: String, Codable, Sendable, CaseIterable {
    case lead = "LEAD"
    case qualified = "QUALIFIED"
    case contacted = "CONTACTED"
    case demo = "DEMO"
    case proposal = "PROPOSAL"
    case won = "WON"
    case lost = "LOST"
}

public enum Priority: String, Codable, Sendable, CaseIterable {
    case low = "BASSE"
    case normal = "NORMALE"
    case high = "HAUTE"
    case urgent = "URGENTE"
}

public enum LeadTemperature: String, Codable, Sendable, CaseIterable {
    case cold = "FROID"
    case warm = "TIEDE"
    case hot = "CHAUD"
    case veryHot = "TRES_CHAUD"
}

public enum InteractionSubject: String, Codable, Sendable, CaseIterable {
    case lead = "LEAD"
    case client = "CLIENT"
}

public enum InteractionKind: String, Codable, Sendable, CaseIterable {
    case email = "EMAIL"
    case call = "CALL"
    case meeting = "MEETING"
    case note = "NOTE"
}

public enum InteractionDirection: String, Codable, Sendable, CaseIterable {
    case outgoing = "OUT"
    case incoming = "IN"
    case none = "NONE"
}

public enum QuoteStatus: String, Codable, Sendable, CaseIterable {
    case draft = "DRAFT"
    case sent = "SENT"
    case signed = "SIGNED"
    case expired = "EXPIRED"
    case cancelled = "CANCELLED"
}

public enum ProjectStatus: String, Codable, Sendable, CaseIterable {
    case active = "EN_COURS"
    case waiting = "EN_ATTENTE"
    case completed = "TERMINE"
}

public enum PhaseStatus: String, Codable, Sendable, CaseIterable {
    case upcoming = "A_VENIR"
    case active = "EN_COURS"
    case awaitingValidation = "EN_ATTENTE_VALIDATION"
    case completed = "TERMINEE"
}

public enum BillingStatus: String, Codable, Sendable, CaseIterable {
    case notInvoiced = "NON_FACTURE"
    case partial = "PARTIEL"
    case invoiced = "FACTURE"
}

public enum ChangeRequestStatus: String, Codable, Sendable, CaseIterable {
    case submitted = "SOUMISE"
    case toEstimate = "A_CHIFFRER"
    case planned = "PLANIFIEE"
    case active = "EN_COURS"
    case delivered = "LIVREE"
    case validated = "VALIDEE"
    case refused = "REFUSEE"
}

public enum TicketStatus: String, Codable, Sendable, CaseIterable {
    case open = "OUVERT"
    case active = "EN_COURS"
    case resolved = "RESOLU"
    case closed = "FERME"
}

public struct UserSummary: Codable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var initials: String
    public var role: UserRole

    public init(id: String, name: String, initials: String, role: UserRole) {
        self.id = id
        self.name = name
        self.initials = initials
        self.role = role
    }
}

public struct Lead: Codable, Sendable, Identifiable {
    public var id: String
    public var company: String
    public var contactName: String
    public var contactEmail: String
    public var contactPhone: String
    public var source: String
    public var status: LeadStage
    public var priority: Priority
    public var budget: Decimal?
    public var nextActionAt: Date?
    public var serviceType: String
    public var leadTemperature: LeadTemperature
    public var assignedTo: String?
    public var score: Int?
    public var notes: String
    public var createdAt: Date

    public init(id: String, company: String, contactName: String, contactEmail: String = "", contactPhone: String = "", source: String = "", status: LeadStage, priority: Priority = .normal, budget: Decimal?, nextActionAt: Date?, serviceType: String, leadTemperature: LeadTemperature, assignedTo: String?, score: Int?, notes: String = "", createdAt: Date) {
        self.id = id
        self.company = company
        self.contactName = contactName
        self.contactEmail = contactEmail
        self.contactPhone = contactPhone
        self.source = source
        self.status = status
        self.priority = priority
        self.budget = budget
        self.nextActionAt = nextActionAt
        self.serviceType = serviceType
        self.leadTemperature = leadTemperature
        self.assignedTo = assignedTo
        self.score = score
        self.notes = notes
        self.createdAt = createdAt
    }
}

public struct LeadActivity: Codable, Sendable, Identifiable {
    public var id: String
    public var leadId: String
    public var type: String
    public var label: String
    public var actorId: String?
    public var createdAt: Date

    public init(id: String, leadId: String, type: String, label: String, actorId: String?, createdAt: Date) {
        self.id = id
        self.leadId = leadId
        self.type = type
        self.label = label
        self.actorId = actorId
        self.createdAt = createdAt
    }
}

public struct Interaction: Codable, Sendable, Identifiable {
    public var id: String
    public var subjectType: InteractionSubject
    public var subjectId: String
    public var kind: InteractionKind
    public var direction: InteractionDirection
    public var occurredAt: Date
    public var subject: String
    public var body: String
    public var author: String?

    public init(id: String, subjectType: InteractionSubject, subjectId: String, kind: InteractionKind, direction: InteractionDirection, occurredAt: Date, subject: String, body: String, author: String?) {
        self.id = id
        self.subjectType = subjectType
        self.subjectId = subjectId
        self.kind = kind
        self.direction = direction
        self.occurredAt = occurredAt
        self.subject = subject
        self.body = body
        self.author = author
    }
}

public struct QuoteProposal: Codable, Sendable, Identifiable {
    public var id: String
    public var project: String
    public var client: String
    public var createdBy: String
    public var title: String
    public var status: QuoteStatus
    public var lines: [QuoteLine]
    public var signature: QuoteSignature
    public var viewedAt: Date?
    public var reference: String

    public init(id: String, project: String, client: String, createdBy: String, title: String, status: QuoteStatus, lines: [QuoteLine], signature: QuoteSignature, viewedAt: Date?, reference: String) {
        self.id = id
        self.project = project
        self.client = client
        self.createdBy = createdBy
        self.title = title
        self.status = status
        self.lines = lines
        self.signature = signature
        self.viewedAt = viewedAt
        self.reference = reference
    }
}

public struct Project: Codable, Sendable, Identifiable {
    public var id: String
    public var projectNumber: String
    public var name: String
    public var client: String
    public var status: ProjectStatus
    public var budget: ProjectBudget
    public var billing: ProjectBilling
    public var endDate: Date?
    public var progress: Int

    public init(id: String, projectNumber: String, name: String, client: String, status: ProjectStatus, budget: ProjectBudget, billing: ProjectBilling, endDate: Date?, progress: Int) {
        self.id = id
        self.projectNumber = projectNumber
        self.name = name
        self.client = client
        self.status = status
        self.budget = budget
        self.billing = billing
        self.endDate = endDate
        self.progress = progress
    }
}

public struct ProjectPhase: Codable, Sendable, Identifiable {
    public var id: String
    public var project: String
    public var title: String
    public var order: Int
    public var status: PhaseStatus
    public var dueAt: Date?

    public init(id: String, project: String, title: String, order: Int, status: PhaseStatus, dueAt: Date?) {
        self.id = id
        self.project = project
        self.title = title
        self.order = order
        self.status = status
        self.dueAt = dueAt
    }
}

public struct ChangeRequest: Codable, Sendable, Identifiable {
    public var id: String
    public var project: String?
    public var title: String
    public var status: ChangeRequestStatus

    public init(id: String, project: String?, title: String, status: ChangeRequestStatus) {
        self.id = id
        self.project = project
        self.title = title
        self.status = status
    }
}

public struct ProjectTicket: Codable, Sendable, Identifiable {
    public var id: String
    public var project: String
    public var title: String
    public var status: TicketStatus

    public init(id: String, project: String, title: String, status: TicketStatus) {
        self.id = id
        self.project = project
        self.title = title
        self.status = status
    }
}

public struct ProjectUpdate: Codable, Sendable, Identifiable {
    public var id: String
    public var project: String
    public var title: String
    public var description: String
    public var createdAt: Date

    public init(id: String, project: String, title: String, description: String = "", createdAt: Date) {
        self.id = id
        self.project = project
        self.title = title
        self.description = description
        self.createdAt = createdAt
    }
}

public struct Appointment: Codable, Sendable, Identifiable {
    public var id: String
    public var leadId: String
    public var title: String
    public var startsAt: Date
    public var assignedTo: String
    public var location: String

    public init(id: String, leadId: String, title: String, startsAt: Date, assignedTo: String, location: String) {
        self.id = id
        self.leadId = leadId
        self.title = title
        self.startsAt = startsAt
        self.assignedTo = assignedTo
        self.location = location
    }
}

