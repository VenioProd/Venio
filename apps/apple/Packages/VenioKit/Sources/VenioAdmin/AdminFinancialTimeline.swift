#if !os(watchOS)
import SwiftUI
import Charts
import VenioTheme

struct AdminFinancialTimeline: View {
    @Environment(\.venioPalette) private var palette
    @Environment(\.locale) private var locale
    @State private var selection: Date?
    let figures: BusinessFigures
    private var formats: AdminFormats { AdminFormats(locale: locale) }
    private var months: [MonthlyAmount] { figures.overview.cashIn.sorted { $0.month < $1.month } }
    private var selected: MonthlyAmount? {
        guard let selection else { return months.last }
        return months.min { abs($0.month.timeIntervalSince(selection)) < abs($1.month.timeIntervalSince(selection)) }
    }
    private var cumulative: Int {
        guard let selected else { return 0 }
        return figures.cumulativeCashIn.first { $0.month == selected.month }?.amountCents ?? 0
    }
    private var dateRange: ClosedRange<Date> {
        let first = months.first?.month ?? figures.clock.now
        let last = months.last?.month ?? first
        return first.addingTimeInterval(-15 * 86400)...last.addingTimeInterval(15 * 86400)
    }
    private var selectionSummary: String {
        guard let selected else { return AdminStrings.text("Aucun encaissement", locale: locale) }
        return AdminStrings.format("%@ · %@ · cumul %@", locale: locale,
            formats.date(selected.month, template: "MMMyyyy"), formats.money(selected.amountCents), formats.money(cumulative))
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            AdminText("Encaissements").font(.headline)
            Text(verbatim: selectionSummary).font(.subheadline.monospacedDigit())
                .padding(8).background(palette.accent.color.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
            if months.isEmpty { AdminEmptyView(title: "Aucun encaissement") }
            else {
                Chart {
                    ForEach(figures.cumulativeCashIn, id: \.month) { point in
                        AreaMark(x: .value(xLabel, point.month), y: .value(yLabel, Double(point.amountCents) / 100))
                            .interpolationMethod(.monotone)
                            .foregroundStyle(LinearGradient(colors: [palette.accent.color.opacity(0.45), palette.accent.color.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                        LineMark(x: .value(xLabel, point.month), y: .value(yLabel, Double(point.amountCents) / 100))
                            .interpolationMethod(.monotone).foregroundStyle(palette.accent.color)
                    }
                    if let selected {
                        RuleMark(x: .value(xLabel, selected.month))
                            .lineStyle(StrokeStyle(dash: [3, 4])).foregroundStyle(palette.accentText.color)
                        RuleMark(y: .value(yLabel, Double(cumulative) / 100))
                            .lineStyle(StrokeStyle(dash: [3, 4])).foregroundStyle(palette.accentText.color.opacity(0.4))
                        PointMark(x: .value(xLabel, selected.month), y: .value(yLabel, Double(cumulative) / 100))
                            .foregroundStyle(palette.accentText.color)
                    }
                }
                .chartXScale(domain: dateRange).chartXSelection(value: $selection)
                .chartXAxis {
                    AxisMarks(values: months.map(\.month)) { value in
                        AxisValueLabel {
                            if let date = value.as(Date.self) { Text(verbatim: formats.date(date, template: "MMM")) }
                        }
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisGridLine()
                        AxisValueLabel {
                            if let amount = value.as(Double.self) {
                                Text(verbatim: amount.formatted(.number.notation(.compactName).locale(locale))).frame(width: axisWidth, alignment: .trailing)
                            }
                        }
                    }
                }
                .frame(height: 230)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(verbatim: AdminStrings.text("Encaissements cumulés", locale: locale)))
                .accessibilityValue(Text(verbatim: selectionSummary))
                Chart(months, id: \.month) { point in
                    BarMark(x: .value(xLabel, point.month), y: .value(yLabel, Double(point.amountCents) / 100), width: .fixed(26))
                        .foregroundStyle(palette.accent.color.opacity(point.month == selected?.month ? 0.9 : 0.45))
                }
                .chartXScale(domain: dateRange).chartXAxis(.hidden)
                // Même gouttière que l'axe du graphe principal, pour que chaque barre tombe sous son mois.
                .chartYAxis {
                    AxisMarks(position: .leading, values: [0]) { _ in
                        AxisValueLabel { Color.clear.frame(width: axisWidth, height: 1) }
                    }
                }
                .frame(height: 42)
                    .accessibilityLabel(Text(verbatim: AdminStrings.text("Encaissé du mois", locale: locale)))
                AdminText("Encaissé du mois").font(.caption)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 160))], alignment: .leading, spacing: 12) {
                summary("Cumul sur la période", cents: figures.cumulativeCashIn.last?.amountCents ?? 0)
                if let best = figures.bestMonth {
                    VStack(alignment: .leading, spacing: 4) {
                        summary("Meilleur mois", cents: best.amountCents)
                        Text(verbatim: formats.date(best.month, template: "MMM")).font(.caption)
                    }
                }
                summary("Encaissé du mois courant", cents: figures.overview.receivedCents)
            }
        }.privacySensitive().monospacedDigit()
    }
    private let axisWidth: CGFloat = 52
    private var xLabel: String { AdminStrings.text("Mois", locale: locale) }
    private var yLabel: String { AdminStrings.text("Cumul", locale: locale) }
    private func summary(_ title: String, cents: Int) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            AdminText(title).font(.caption)
            AdminMoney(cents: cents).font(.headline)
        }
    }
}
#endif
