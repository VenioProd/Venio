import Foundation

public struct SalesFigures: Sendable {
    public struct Month: Sendable, Identifiable {
        public let id: Date
        public let amount: Decimal
        public let volume: Int
    }
    public struct LossReason: Sendable, Identifiable {
        public var id: String { reason }
        public let reason: String
        public let percent: Int
    }
    public let months: [Month]
    public var signedThisMonth: Decimal { months.last?.amount ?? 0 }
    public let monthlyTarget: Decimal?
    public var targetPercent: Int? {
        guard let monthlyTarget, monthlyTarget > 0 else { return nil }
        return Int((NSDecimalNumber(decimal: signedThisMonth / monthlyTarget).doubleValue * 100).rounded())
    }
    public let conversionPercent: Int
    public let averageCycleDays: Double
    public let lossReasons: [LossReason]

    public init(leads: [Lead], quotes: [QuoteProposal], userId: String, now: Date, calendar: Calendar, monthlyTarget: Decimal? = nil) {
        self.monthlyTarget = monthlyTarget
        let start = calendar.dateInterval(of: .month, for: now)!.start
        let signed = quotes.filter { $0.createdBy == userId && $0.status == .signed }
        months = (-5...0).map { offset in
            let month = calendar.date(byAdding: .month, value: offset, to: start)!
            let end = calendar.date(byAdding: .month, value: 1, to: month)!
            let matches = signed.filter {
                guard let date = $0.signature.signedAt else { return false }
                return date >= month && date < end && date <= now
            }
            return Month(id: month, amount: matches.reduce(0) { $0 + $1.amountHT }, volume: matches.count)
        }
        let since = calendar.date(byAdding: .month, value: -12, to: now)!
        let closed = leads.filter {
            guard $0.assignedTo == userId, !$0.status.isOpen, let date = $0.statusChangedAt else { return false }
            return date >= since && date <= now
        }
        let won = closed.filter { $0.status == .won }
        conversionPercent = closed.isEmpty ? 0 : Int((Double(won.count) / Double(closed.count) * 100).rounded())
        averageCycleDays = won.isEmpty ? 0 : won.reduce(0.0) {
            $0 + Double(calendar.dateComponents([.day], from: $1.createdAt, to: $1.statusChangedAt!).day ?? 0)
        } / Double(won.count)
        let lost = closed.filter { $0.status == .lost }
        lossReasons = Dictionary(grouping: lost, by: \.lostReason).map { reason, entries in
            LossReason(reason: reason, percent: Int((Double(entries.count) / Double(lost.count) * 100).rounded()))
        }.sorted { $0.percent == $1.percent ? $0.reason < $1.reason : $0.percent > $1.percent }
    }
}
