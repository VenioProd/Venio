import Foundation

public struct QuoteLine: Codable, Sendable {
    public var description: String
    public var quantity: Decimal
    public var unitPrice: Decimal
    public var taxRate: Decimal
    public var isOptional: Bool

    public init(description: String, quantity: Decimal, unitPrice: Decimal, taxRate: Decimal = 0, isOptional: Bool = false) {
        self.description = description
        self.quantity = quantity
        self.unitPrice = unitPrice
        self.taxRate = taxRate
        self.isOptional = isOptional
    }
}

public struct QuoteSignature: Codable, Sendable {
    public var signedAt: Date?

    public init(signedAt: Date?) { self.signedAt = signedAt }
}

extension QuoteProposal {
    public var amountHT: Decimal { lines.filter { !$0.isOptional }.reduce(0) { $0 + $1.quantity * $1.unitPrice } }
    public var amountTax: Decimal { lines.filter { !$0.isOptional }.reduce(0) { $0 + $1.quantity * $1.unitPrice * $1.taxRate / 100 } }
    public var amountTTC: Decimal { amountHT + amountTax }
}

public struct ProjectBudget: Codable, Sendable {
    public var amount: Decimal?
    public var currency: String

    public init(amount: Decimal?, currency: String = "EUR") {
        self.amount = amount
        self.currency = currency
    }
}

public struct ProjectBilling: Codable, Sendable {
    public var amountInvoiced: Decimal?
    public var billingStatus: BillingStatus

    public init(amountInvoiced: Decimal?, billingStatus: BillingStatus) {
        self.amountInvoiced = amountInvoiced
        self.billingStatus = billingStatus
    }
}

public struct ProjectDetail: Codable, Sendable {
    public var project: Project
    public var phases: [ProjectPhase]
    public var requests: [ChangeRequest]
    public var tickets: [ProjectTicket]
    public var updates: [ProjectUpdate]

    public init(project: Project, phases: [ProjectPhase], requests: [ChangeRequest], tickets: [ProjectTicket], updates: [ProjectUpdate]) {
        self.project = project
        self.phases = phases
        self.requests = requests
        self.tickets = tickets
        self.updates = updates
    }
}

public struct TimelineEntry: Sendable, Identifiable {
    public let id: String
    public let date: Date
    public let title: String
    public let body: String
    public enum DeliveryState: Sendable { case pending, failed }
    public let deliveryState: DeliveryState?

    public init(id: String, date: Date, title: String, body: String, deliveryState: DeliveryState? = nil) {
        self.id = id; self.date = date; self.title = title; self.body = body; self.deliveryState = deliveryState
    }

    public static func merged(activities: [LeadActivity], interactions: [Interaction]) -> [Self] {
        let activityEntries = activities.map {
            Self(id: "activity-\($0.id)", date: $0.createdAt, title: $0.label, body: "")
        }
        let interactionEntries = interactions.map {
            Self(id: "interaction-\($0.id)", date: $0.occurredAt, title: $0.subject, body: $0.body)
        }
        return (activityEntries + interactionEntries).sorted {
            if $0.date == $1.date { return $0.id < $1.id }
            return $0.date > $1.date
        }
    }
}
