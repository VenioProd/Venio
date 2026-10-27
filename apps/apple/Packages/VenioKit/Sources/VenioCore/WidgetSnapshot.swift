import Foundation

public struct WidgetSnapshot: Codable, Sendable {
    public struct FollowUp: Codable, Sendable {
        public let company: String
        public let date: Date
        public let leadID: String
    }

    public let updatedAt: Date
    public let connected: Bool
    public let theme: String
    public let accent: String
    public let background: String
    public let language: String
    public let followUpCount: Int
    public let nextFollowUp: FollowUp?
    public let signedRevenue: Decimal
    public let monthlyTarget: Decimal?

    public var progress: Double? {
        guard let monthlyTarget, monthlyTarget > 0 else { return nil }
        return min(1, max(0, NSDecimalNumber(decimal: signedRevenue / monthlyTarget).doubleValue))
    }

    public static func build(leads: [Lead], quotes: [QuoteProposal], appointments: [Appointment],
                             userID: String?, monthlyTarget: Decimal?, now: Date, calendar: Calendar,
                             theme: String = "glass", accent: String = "sky", background: String = "mist",
                             language: String = "fr") -> Self {
        let agenda = TodayAgenda(leads: leads, quotes: [], appointments: appointments, now: now,
                                 calendar: calendar, userId: userID ?? "")
        let followUps = userID == nil ? [] : agenda.followUps
        let next = followUps.first { ($0.nextActionAt ?? .distantPast) >= now }
        let figures = SalesFigures(leads: [], quotes: quotes, userId: userID ?? "", now: now,
                                   calendar: calendar, monthlyTarget: monthlyTarget)
        return Self(updatedAt: now, connected: userID != nil, theme: theme, accent: accent,
                    background: background, language: language, followUpCount: followUps.count,
                    nextFollowUp: next.flatMap { lead in
                        lead.nextActionAt.map { FollowUp(company: lead.company, date: $0, leadID: lead.id) }
                    }, signedRevenue: userID == nil ? 0 : figures.signedThisMonth,
                    monthlyTarget: userID == nil ? nil : monthlyTarget)
    }

    public static func disconnected(now: Date = .now) -> Self {
        build(leads: [], quotes: [], appointments: [], userID: nil, monthlyTarget: nil,
              now: now, calendar: .current)
    }
}

public struct WidgetSnapshotStore: Sendable {
    public static let groupID = "group.paris.venio.app"
    public init() {}

    private var fileURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.groupID)?
            .appendingPathComponent("widgets.json")
    }

    public func read() -> WidgetSnapshot {
        guard let fileURL, let data = try? Data(contentsOf: fileURL),
              let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data) else { return .disconnected() }
        return snapshot
    }

    @discardableResult public func write(_ snapshot: WidgetSnapshot) -> Bool {
        guard let fileURL, let data = try? JSONEncoder().encode(snapshot) else { return false }
        do { try data.write(to: fileURL, options: .atomic); return true }
        catch { return false }
    }
}
