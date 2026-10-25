import ActivityKit
import SwiftUI
import WidgetKit
import VenioCore
import VenioTheme

struct MeetingActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MeetingActivityAttributes.self) { context in
            MeetingActivityView(context: context)
                .padding()
                .activityBackgroundTint(WidgetAppearance(snapshot: WidgetSnapshotStore().read()).palette.base.color)
                .activitySystemActionForegroundColor(WidgetAppearance(snapshot: WidgetSnapshotStore().read()).palette.accentText.color)
                .widgetURL(URL(string: "venio://today"))
        } dynamicIsland: { context in
            let appearance = WidgetAppearance(snapshot: WidgetSnapshotStore().read())
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(appearance.text("Rendez-vous"), systemImage: "calendar")
                        .foregroundStyle(appearance.palette.accent.color)
                }
                DynamicIslandExpandedRegion(.trailing) { MeetingStatus(context: context, appearance: appearance) }
                DynamicIslandExpandedRegion(.bottom) { MeetingActivityView(context: context, island: true) }
            } compactLeading: {
                Image(systemName: "calendar").foregroundStyle(appearance.palette.accent.color)
            } compactTrailing: {
                MeetingStatus(context: context, appearance: appearance).frame(maxWidth: 64)
            } minimal: {
                Image(systemName: "calendar").foregroundStyle(appearance.palette.accent.color)
            }
            .keylineTint(appearance.palette.accent.color)
            .widgetURL(URL(string: "venio://today"))
        }
    }
}

private struct MeetingStatus: View {
    let context: ActivityViewContext<MeetingActivityAttributes>
    let appearance: WidgetAppearance
    var body: some View {
        if context.state.status == .ended || context.isStale {
            Text(appearance.text("Terminé")).font(.caption)
        } else {
            TimelineView(.periodic(from: .now, by: 1)) { timeline in
                if timeline.date < context.state.displayedAt && context.state.status == .upcoming {
                    Text(timerInterval: timeline.date...context.state.displayedAt, countsDown: true)
                        .monospacedDigit().font(.caption)
                } else { Text(appearance.text("En cours")).font(.caption) }
            }
        }
    }
}

private struct MeetingActivityView: View {
    let context: ActivityViewContext<MeetingActivityAttributes>
    var island = false
    private var appearance: WidgetAppearance { WidgetAppearance(snapshot: WidgetSnapshotStore().read()) }
    private var phoneURL: URL? {
        guard let phone = context.attributes.phone else { return nil }
        let number = phone.filter { $0.isNumber || $0 == "+" }
        guard number.contains(where: \.isNumber) else { return nil }
        return URL(string: "tel:" + number)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(context.attributes.title).font(.headline).lineLimit(2)
            Text([context.attributes.company, context.attributes.contact].filter { !$0.isEmpty }.joined(separator: " · "))
                .font(.subheadline).lineLimit(1)
            HStack {
                Text(appearance.time(context.attributes.startsAt) + " – " + appearance.time(context.attributes.endsAt)).font(.caption)
                Spacer()
                if !island { MeetingStatus(context: context, appearance: appearance) }
                if let phoneURL, !context.isStale, context.state.status != .ended {
                    Link(destination: phoneURL) { Label(appearance.text("Appeler"), systemImage: "phone.fill") }
                        .font(.callout.bold()).tint(appearance.palette.accentText.color)
                }
            }
        }
        .foregroundStyle(island ? Color.primary : appearance.palette.textPrimary.color)
        .environment(\.locale, appearance.locale)
    }
}
