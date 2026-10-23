import Foundation

extension LeadStage {
    public var probability: Decimal {
        switch self {
        case .lead: Decimal(10) / 100
        case .qualified: Decimal(25) / 100
        case .contacted: Decimal(35) / 100
        case .demo: Decimal(50) / 100
        case .proposal: Decimal(70) / 100
        case .won: 1
        case .lost: 0
        }
    }

    public var isOpen: Bool { self != .won && self != .lost }
}

public enum PipelineScope: Sendable {
    case mine(String)
    case all
}

public struct PipelineSummary: Sendable {
    public struct Stage: Sendable, Identifiable {
        public var id: LeadStage
        public var count: Int
        public var amount: Decimal
        public var weighted: Decimal
    }

    public let stages: [Stage]
    public var count: Int { stages.reduce(0) { $0 + $1.count } }
    public var amount: Decimal { stages.reduce(0) { $0 + $1.amount } }
    public var weighted: Decimal { stages.reduce(0) { $0 + $1.weighted } }

    public init(leads: [Lead], scope: PipelineScope) {
        let selected = leads.filter { lead in
            guard lead.status.isOpen else { return false }
            switch scope {
            case .all: return true
            case .mine(let id): return lead.assignedTo == id
            }
        }
        stages = LeadStage.allCases.filter(\.isOpen).map { stage in
            let matches = selected.filter { $0.status == stage }
            let amount = matches.reduce(Decimal.zero) { $0 + ($1.budget ?? 0) }
            return Stage(id: stage, count: matches.count, amount: amount, weighted: amount * stage.probability)
        }
    }
}

public struct TodayAgenda: Sendable {
    public let overdue: [Lead]
    public let followUps: [Lead]
    public let appointments: [Appointment]
    public let hotWithoutAction: [Lead]
    public let incoming: [Lead]
    public let viewedQuotes: [QuoteProposal]

    public init(leads: [Lead], quotes: [QuoteProposal], appointments: [Appointment], now: Date, calendar: Calendar, userId: String) {
        let start = calendar.startOfDay(for: now)
        let mine = leads.filter { $0.assignedTo == userId && $0.status.isOpen }
        let todaysAppointments = appointments.filter {
            $0.assignedTo == userId && calendar.isDate($0.startsAt, inSameDayAs: now)
        }.sorted { $0.startsAt < $1.startsAt }
        self.appointments = todaysAppointments
        overdue = mine.filter { lead in
            guard let date = lead.nextActionAt else { return false }
            return date < start
        }.sorted { $0.nextActionAt! < $1.nextActionAt! }
        followUps = mine.filter { lead in
            guard let date = lead.nextActionAt, calendar.isDate(date, inSameDayAs: now) else { return false }
            // Un RDV prévu à la même heure n'est pas une relance supplémentaire.
            return !todaysAppointments.contains { $0.leadId == lead.id && $0.startsAt == date }
        }.sorted { $0.nextActionAt! < $1.nextActionAt! }
        hotWithoutAction = mine.filter { lead in
            (lead.leadTemperature == .hot || lead.leadTemperature == .veryHot)
                && lead.nextActionAt == nil
                && !appointments.contains { $0.leadId == lead.id && $0.startsAt >= start }
        }
        incoming = leads.filter {
            $0.status.isOpen && $0.assignedTo == nil && $0.createdAt <= now
                && calendar.isDate($0.createdAt, inSameDayAs: now)
        }.sorted { $0.createdAt < $1.createdAt }
        viewedQuotes = quotes.filter {
            $0.createdBy == userId && $0.status == .sent && $0.viewedAt != nil && $0.viewedAt! <= now
        }.sorted { $0.viewedAt! > $1.viewedAt! }
    }
}
