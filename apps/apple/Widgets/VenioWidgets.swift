import SwiftUI
import WidgetKit
import VenioCore
import VenioTheme

struct SnapshotEntry: WidgetKit.TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry { demo() }
    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(context.isPreview ? demo() : SnapshotEntry(date: .now, snapshot: WidgetSnapshotStore().read()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        let now = Date.now
        let snapshot = WidgetSnapshotStore().read()
        let next = snapshot.nextFollowUp?.date
        let refresh = min(now.addingTimeInterval(30 * 60), next.flatMap { $0 > now ? $0 : nil } ?? .distantFuture)
        completion(Timeline(entries: [SnapshotEntry(date: now, snapshot: snapshot)], policy: .after(refresh)))
    }
    private func demo() -> SnapshotEntry {
        let now = Date.now
        let lead = Lead(id: "demo", company: "Atelier Nova", contactName: "", status: .qualified,
            budget: nil, nextActionAt: now.addingTimeInterval(1200), serviceType: "", leadTemperature: .warm,
            assignedTo: "demo", score: nil, createdAt: now)
        let quote = QuoteProposal(id: "demo", project: nil, client: nil, createdBy: "demo", title: "",
            status: .signed, lines: [QuoteLine(description: "", quantity: 1, unitPrice: 27300, taxRate: 0)],
            signature: QuoteSignature(signedAt: now), firstViewedAt: nil, expiresAt: nil, createdAt: now, updatedAt: now)
        return SnapshotEntry(date: now, snapshot: .build(leads: [lead], quotes: [quote], appointments: [],
            userID: "demo", monthlyTarget: 40000, now: now, calendar: .current))
    }
}

struct CommercialWidgetView: View {
    let entry: SnapshotEntry
    let revenue: Bool
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    private var appearance: WidgetAppearance { WidgetAppearance(snapshot: entry.snapshot) }
    private var primary: Color { renderingMode == .fullColor ? appearance.palette.textPrimary.color : .primary }
    private var secondary: Color { renderingMode == .fullColor ? appearance.palette.textSecondary.color : .secondary }
    private var accent: Color { renderingMode == .fullColor ? appearance.palette.accentText.color : .primary }
    private var next: WidgetSnapshot.FollowUp? {
        entry.snapshot.nextFollowUp.flatMap { $0.date >= entry.date ? $0 : nil }
    }

    var body: some View {
        Group {
            if !entry.snapshot.connected {
                Label(appearance.text("Ouvrez Venio"), systemImage: "arrow.up.forward.app")
                    .font(.caption)
            } else if revenue { revenueBody }
            else { followUpBody }
        }
        .foregroundStyle(primary)
        .tint(accent)
        .environment(\.locale, appearance.locale)
        .containerBackground(for: .widget) {
            if renderingMode == .fullColor {
                LinearGradient(colors: [appearance.palette.base.color,
                    (appearance.palette.halos.first ?? appearance.palette.surfaces.first ?? appearance.palette.base).color.opacity(0.5)],
                    startPoint: .topLeading, endPoint: .bottomTrailing)
            } else { Color.clear }
        }
        .widgetURL(URL(string: revenue ? "venio://figures" : "venio://today"))
    }

    @ViewBuilder private var followUpBody: some View {
        switch family {
        case .accessoryCircular:
            VStack(spacing: 0) {
                Image(systemName: "phone.arrow.up.right").font(.caption).widgetAccentable()
                Text(entry.snapshot.followUpCount, format: .number).font(.title2.bold())
            }.accessibilityLabel(appearance.text("Relances du jour") + ": \(entry.snapshot.followUpCount)")
        case .accessoryInline:
            Label(appearance.text("Relances du jour") + ": \(entry.snapshot.followUpCount)", systemImage: "phone.arrow.up.right")
        case .accessoryRectangular:
            VStack(alignment: .leading) {
                Text(appearance.text("Relances du jour") + ": \(entry.snapshot.followUpCount)").font(.headline)
                nextLabel
            }
        default:
            VStack(alignment: .leading, spacing: 8) {
                Label(appearance.text("Relances du jour"), systemImage: "phone.arrow.up.right").font(.caption).foregroundStyle(secondary)
                HStack(alignment: .center, spacing: 20) {
                    Text(entry.snapshot.followUpCount, format: .number).font(.system(size: 42, weight: .bold, design: .rounded))
                        .foregroundStyle(accent).widgetAccentable()
                    if family == .systemMedium { nextDetails }
                }
                if family == .systemSmall { nextDetails }
            }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }
    private var nextDetails: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(appearance.text("Prochaine relance")).font(.caption2).foregroundStyle(secondary)
            nextLabel
        }
    }
    @ViewBuilder private var nextLabel: some View {
        if let next {
            Text(next.company).font(.subheadline.bold()).lineLimit(1)
            Text(appearance.time(next.date)).font(.caption).foregroundStyle(secondary)
        } else {
            Text(appearance.text("Aucune relance à venir")).font(.caption).foregroundStyle(secondary)
        }
    }

    @ViewBuilder private var revenueBody: some View {
        switch family {
        case .accessoryCircular:
            if let progress = entry.snapshot.progress {
                Gauge(value: progress) { Image(systemName: "chart.bar") } currentValueLabel: {
                    Text(progress, format: .percent.precision(.fractionLength(0)))
                }.gaugeStyle(.accessoryCircular).widgetAccentable()
            } else { Image(systemName: "chart.bar").accessibilityLabel(appearance.text("Objectif non défini")) }
        case .accessoryRectangular:
            VStack(alignment: .leading) {
                Text(appearance.text("CA du mois")).font(.headline)
                Text(appearance.money(entry.snapshot.signedRevenue)).font(.headline)
                targetLabel
            }
        default:
            VStack(alignment: .leading, spacing: 8) {
                Label(appearance.text("CA du mois"), systemImage: "chart.bar").font(.caption).foregroundStyle(secondary)
                Text(appearance.money(entry.snapshot.signedRevenue)).font(.title2.bold()).minimumScaleFactor(0.6).lineLimit(1)
                if let progress = entry.snapshot.progress {
                    Gauge(value: progress) { Text(appearance.text("Objectif mensuel")).lineLimit(1).minimumScaleFactor(0.7) }
                        .gaugeStyle(.linearCapacity).widgetAccentable()
                }
                targetLabel
            }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }
    @ViewBuilder private var targetLabel: some View {
        if let progress = entry.snapshot.progress, let target = entry.snapshot.monthlyTarget {
            Text(progress.formatted(.percent.precision(.fractionLength(0)).locale(appearance.locale)) + " · " + appearance.money(target))
                .font(.caption).foregroundStyle(secondary).lineLimit(1).minimumScaleFactor(0.7)
        } else { Text(appearance.text("Objectif non défini")).font(.caption).foregroundStyle(secondary) }
    }
}

struct FollowUpsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VenioFollowUps", provider: SnapshotProvider()) { entry in
            CommercialWidgetView(entry: entry, revenue: false)
        }
        .configurationDisplayName("Relances du jour")
        .description("Vos relances et la prochaine société à contacter.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct RevenueWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VenioRevenue", provider: SnapshotProvider()) { entry in
            CommercialWidgetView(entry: entry, revenue: true)
        }
        .configurationDisplayName("CA du mois face à l’objectif")
        .description("Votre chiffre d’affaires signé et votre objectif mensuel.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

@main struct VenioWidgets: WidgetBundle {
    var body: some Widget {
        FollowUpsWidget()
        RevenueWidget()
        MeetingActivityWidget()
    }
}
