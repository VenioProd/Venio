import Foundation
import VenioCore

public struct BusinessFigures: Sendable {
    public let overview: BusinessOverview
    public let clock: DemoClock
    public init(overview: BusinessOverview, clock: DemoClock = DemoClock()) {
        self.overview = overview
        self.clock = clock
    }

    public var receivedPercent: Int? {
        guard overview.invoicedCents > 0 else { return nil }
        return roundedPercent(overview.receivedCents, of: overview.invoicedCents)
    }
    public var overdueCents: Int { overview.overdueInvoices.reduce(0) { $0 + $1.remainingCents } }
    public func overdueDays(for invoice: OverdueInvoice) -> Int {
        let calendar = clock.calendar
        return max(0, calendar.dateComponents([.day], from: calendar.startOfDay(for: invoice.dueAt),
                                             to: calendar.startOfDay(for: clock.now)).day ?? 0)
    }
    public var cumulativeCashIn: [MonthlyAmount] {
        var total = 0
        return overview.cashIn.sorted { $0.month < $1.month }.map { point in
            total += point.amountCents
            return MonthlyAmount(month: point.month, amountCents: total)
        }
    }
    public var bestMonth: MonthlyAmount? { overview.cashIn.max { $0.amountCents < $1.amountCents } }
    public var previousMonthVariationPercent: Int? {
        guard let previous = clock.calendar.date(byAdding: .month, value: -1, to: overview.month),
              let last = overview.cashIn.first(where: { clock.calendar.isDate($0.month, equalTo: previous, toGranularity: .month) }),
              last.amountCents > 0 else { return nil }
        return roundedPercent(overview.receivedCents - last.amountCents, of: last.amountCents)
    }
    private func roundedPercent(_ value: Int, of total: Int) -> Int {
        var percent = Decimal(value) * 100 / Decimal(total)
        var rounded = Decimal()
        NSDecimalRound(&rounded, &percent, 0, .plain)
        return NSDecimalNumber(decimal: rounded).intValue
    }
}

public struct AdminFormats: Sendable {
    public let locale: Locale
    public init(locale: Locale) { self.locale = locale }
    public func date(_ value: Date, template: String = "dMMMyyyy") -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = TimeZone(identifier: "Europe/Paris")
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: value)
    }
    public func relative(_ value: Date, to now: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.unitsStyle = .full
        return formatter.localizedString(for: value, relativeTo: now)
    }
    public func percent(_ value: Int) -> String {
        (Double(value) / 100).formatted(.percent.precision(.fractionLength(0)).locale(locale))
    }
    public func money(_ cents: Int) -> String {
        let precision = cents.isMultiple(of: 100) ? 0 : 2
        return (Decimal(cents) / 100).formatted(.currency(code: "EUR")
            .precision(.fractionLength(precision)).locale(locale))
    }
}
