#if !os(watchOS)
import SwiftUI
import Charts
import VenioCore
import VenioTheme

public struct SalesFiguresView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
    #endif
    public init() {}
    private var columns: [GridItem] {
        #if os(iOS)
        let count = sizeClass == .regular ? 2 : 1
        #else
        let count = 2
        #endif
        return Array(repeating: GridItem(.flexible(), alignment: .top), count: count)
    }
    public var body: some View {
        let figures = store.figures
        CommercialPage {
            VText("Mes chiffres").font(.largeTitle.bold())
            LazyVGrid(columns: columns, alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 16) {
                    VText("CA signé du mois").font(.headline)
                    Text(verbatim: CommercialFormats(locale: locale).money(figures.signedThisMonth))
                        .font(.largeTitle.bold().monospacedDigit())
                        .contentTransition(.numericText()).animation(.smooth, value: figures.signedThisMonth)
                    if figures.targetPercent != nil { MonthlyTargetCard(figures: figures, ring: false) }
                }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
                FinancialTimeline(months: figures.months).venioCard()
                HStack(spacing: 16) {
                    metric("Conversion sur 12 mois", value: CommercialFormats(locale: locale).percent(Decimal(figures.conversionPercent) / 100))
                    metric("Cycle de vente moyen", value: CommercialStrings.format("%@ jours", locale: locale,
                        figures.averageCycleDays.formatted(.number.precision(.fractionLength(0)).locale(locale))))
                }
                LossReasonsCard(reasons: figures.lossReasons).venioCard()
            }
        }.navigationTitle("")
    }
    private func metric(_ title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VText(title).font(.subheadline)
            Text(verbatim: value).font(.title2.bold().monospacedDigit())
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).venioCard()
    }
}

struct FinancialTimeline: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.venioPalette) private var palette
    @Environment(\.locale) private var locale
    @State private var selection: Date?
    @GestureState private var selecting = false
    @State private var plotMargins: CGSize = .zero
    let months: [SalesFigures.Month]
    private var selected: SalesFigures.Month? {
        if let selection {
            return months.min { abs($0.id.timeIntervalSince(selection)) < abs($1.id.timeIntervalSince(selection)) }
        }
        return months.first { store.clock.calendar.isDate($0.id, equalTo: store.clock.now, toGranularity: .month) } ?? months.last
    }
    private var dateRange: ClosedRange<Date> {
        // Une demi-période de marge de chaque côté pour que le premier et le dernier mois gardent leur libellé.
        let first = months.first?.id ?? .distantPast, last = months.last?.id ?? .distantFuture
        return first.addingTimeInterval(-15 * 86_400)...last.addingTimeInterval(15 * 86_400)
    }
    private func value(_ month: SalesFigures.Month) -> Double { NSDecimalNumber(decimal: month.amount).doubleValue }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VText("CA signé par mois").font(.headline)
            if let month = selected {
                Text(verbatim: CommercialFormats(locale: locale).date(month.id, template: "MMMMyyyy") + " · " +
                     CommercialFormats(locale: locale).money(month.amount)).font(.subheadline.monospacedDigit())
            }
            Chart {
                ForEach(months) { month in
                    AreaMark(x: .value(CommercialStrings.text("Mois", locale: locale), month.id),
                             y: .value(CommercialStrings.text("CA signé", locale: locale), value(month)))
                        .interpolationMethod(.monotone)
                        .foregroundStyle(LinearGradient(colors: [palette.accent.color.opacity(0.45), palette.accent.color.opacity(0.02)],
                                                        startPoint: .top, endPoint: .bottom))
                    LineMark(x: .value(CommercialStrings.text("Mois", locale: locale), month.id),
                             y: .value(CommercialStrings.text("CA signé", locale: locale), value(month)))
                        .interpolationMethod(.monotone).foregroundStyle(palette.accent.color).lineStyle(StrokeStyle(lineWidth: 2.5))
                }
                if let selected {
                    RuleMark(x: .value(CommercialStrings.text("Mois", locale: locale), selected.id))
                        .foregroundStyle(palette.accentText.color.opacity(0.6)).lineStyle(StrokeStyle(dash: [3, 4]))
                    RuleMark(y: .value(CommercialStrings.text("CA signé", locale: locale), value(selected)))
                        .foregroundStyle(palette.accentText.color.opacity(0.3)).lineStyle(StrokeStyle(dash: [3, 4]))
                    PointMark(x: .value(CommercialStrings.text("Mois", locale: locale), selected.id),
                              y: .value(CommercialStrings.text("CA signé", locale: locale), value(selected)))
                        .foregroundStyle(palette.accentText.color)
                }
            }
            .chartXScale(domain: dateRange, range: .plotDimension(padding: 0))
            .chartXSelection(value: $selection)
            .chartGesture { proxy in
                DragGesture(minimumDistance: 0)
                    .updating($selecting) { _, active, _ in active = true }
                    .onChanged { proxy.selectXValue(at: $0.location.x) }
                    .onEnded { _ in selection = nil }
            }
            .chartOverlay { proxy in
                GeometryReader { geometry in
                    if let anchor = proxy.plotFrame {
                        let frame = geometry[anchor]
                        let margins = CGSize(width: frame.minX, height: geometry.size.width - frame.maxX)
                        Color.clear.onChange(of: margins, initial: true) { _, value in plotMargins = value }
                    }
                }.allowsHitTesting(false)
            }
            .onChange(of: selecting) { _, active in if !active { selection = nil } }
            .chartXAxis(.hidden)
            .chartYAxis { AxisMarks(position: .leading) }
            .frame(height: 180)
            Chart(months) { month in
                BarMark(x: .value(CommercialStrings.text("Mois", locale: locale), month.id),
                        y: .value(CommercialStrings.text("Devis signés", locale: locale), month.volume), width: 14)
                    .foregroundStyle(palette.accent.color.opacity(0.4))
                    .annotation(position: .bottom, spacing: 4) {
                        Text(verbatim: CommercialFormats(locale: locale).date(month.id, template: "MMM"))
                            .font(.caption).foregroundStyle(palette.textSecondary.color).lineLimit(1).fixedSize()
                    }
            }
            .chartXScale(domain: dateRange, range: .plotDimension(padding: 0))
            .chartYScale(domain: 0...max(1, months.map(\.volume).max() ?? 0))
            .chartPlotStyle { $0.frame(height: 48) }
            .chartXAxis(.hidden).chartYAxis(.hidden).frame(height: 72)
            .padding(.leading, plotMargins.width).padding(.trailing, plotMargins.height)
            VText("Volume de devis signés").font(.caption).foregroundStyle(palette.textSecondary.color)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct MonthlyTargetCard: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.venioPalette) private var palette
    @Environment(\.locale) private var locale
    let figures: SalesFigures
    var ring = true
    var body: some View {
        if let percent = figures.targetPercent, let target = figures.monthlyTarget {
            let formats = CommercialFormats(locale: locale)
            VStack(alignment: .leading, spacing: 14) {
                Text(verbatim: CommercialStrings.format("Objectif · %@", locale: locale,
                    formats.date(store.clock.now, template: "MMMM"))).font(.headline)
                HStack(spacing: 18) {
                    if ring {
                        ZStack {
                            Circle().stroke(palette.accent.color.opacity(0.15), lineWidth: 9)
                            Circle().trim(from: 0, to: min(1, max(0, Double(percent) / 100)))
                                .stroke(palette.accent.color, style: StrokeStyle(lineWidth: 9, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                            Text(verbatim: formats.percent(Decimal(percent) / 100)).font(.title3.bold())
                        }.frame(width: 84, height: 84)
                    }
                    Text(verbatim: CommercialStrings.format("%@ sur %@", locale: locale, formats.money(figures.signedThisMonth), formats.money(target)))
                        .font(.subheadline.monospacedDigit())
                }
                if !ring {
                    ProgressView(value: min(1, max(0, Double(percent) / 100)))
                        .tint(palette.accent.color)
                    Text(verbatim: formats.percent(Decimal(percent) / 100)).font(.caption.bold())
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct LossReasonsCard: View {
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    let reasons: [SalesFigures.LossReason]
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VText("Motifs de perte").font(.headline)
            if reasons.isEmpty { VText("Aucune perte sur 12 mois") }
            ForEach(reasons) { reason in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(verbatim: CommercialStrings.text(reason.reason.isEmpty ? "Motif non renseigné" : reason.reason.prefix(1).uppercased() + reason.reason.dropFirst(), locale: locale))
                        Spacer()
                        Text(verbatim: CommercialFormats(locale: locale).percent(Decimal(reason.percent) / 100)).monospacedDigit()
                    }.font(.subheadline)
                    ProgressView(value: Double(reason.percent), total: 100).tint(palette.accent.color)
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
#endif
