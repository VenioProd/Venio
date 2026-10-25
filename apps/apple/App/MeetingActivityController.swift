#if os(iOS)
import ActivityKit
import VenioCore
import VenioCommercial
import VenioTheme
import WidgetKit
import SwiftUI

@MainActor final class MeetingActivityController {
    private var update: Task<Void, Never>?
    private var revision = 0

    func refresh(store: CommercialStore?, themes: ThemeManager, mock: Bool, publish: Bool = true) {
        let now = mock ? (store?.clock.now ?? .now) : .now
        let selection = themes.selection
        let userID = store?.hasLoaded == true ? store?.currentUser?.id : nil
        let calendar = store?.clock.calendar ?? .current
        let appointments = store?.appointments ?? []
        if publish {
            let snapshot = WidgetSnapshot.build(leads: store?.leads ?? [], quotes: store?.quotes ?? [],
                appointments: appointments, userID: userID, monthlyTarget: store?.monthlyTarget,
                now: now, calendar: calendar, theme: selection.theme.rawValue, accent: selection.accent,
                background: selection.background, language: themes.locale.language.languageCode?.identifier ?? "fr")
            if WidgetSnapshotStore().write(snapshot) { WidgetCenter.shared.reloadAllTimelines() }
        }
        let meeting = MeetingActivityRule.meeting(appointments: appointments,
            userID: userID, now: now, calendar: calendar)
        let lead = store?.leads.first { $0.id == meeting?.leadId && $0.assignedTo == userID }
        let attributes = meeting.flatMap { meeting -> MeetingActivityAttributes? in
            guard let end = meeting.endsAt else { return nil }
            return MeetingActivityAttributes(meetingID: meeting.id, title: meeting.title,
                company: lead?.company ?? meeting.leadCompany ?? "", contact: lead?.contactName ?? "",
                startsAt: meeting.startsAt, endsAt: end,
                phone: lead?.contactPhone.isEmpty == false ? lead?.contactPhone : nil, leadID: meeting.leadId)
        }
        revision += 1
        let expected = revision
        let previous = update
        update = Task {
            await previous?.value
            guard expected == revision else { return }
            var retained: Activity<MeetingActivityAttributes>?
            for activity in Activity<MeetingActivityAttributes>.activities {
                if ActivityAuthorizationInfo().areActivitiesEnabled, let attributes,
                   activity.attributes == attributes, retained == nil {
                    retained = activity
                } else {
                    let ended = activity.attributes.endsAt <= now && appointments.contains { $0.id == activity.attributes.meetingID }
                    let state = MeetingActivityAttributes.ContentState(displayedAt: .now, status: .ended)
                    await activity.end(ActivityContent(state: state, staleDate: nil),
                        dismissalPolicy: ended && userID != nil ? .after(activity.attributes.endsAt) : .immediate)
                }
            }
            guard expected == revision, let attributes, ActivityAuthorizationInfo().areActivitiesEnabled else { return }
            // En démo, le compte à rebours suit l'heure de capture plutôt que l'horloge du système.
            let displayStart = mock ? Date.now.addingTimeInterval(attributes.startsAt.timeIntervalSince(now)) : attributes.startsAt
            let displayEnd = mock ? Date.now.addingTimeInterval(attributes.endsAt.timeIntervalSince(now)) : attributes.endsAt
            let state = MeetingActivityAttributes.ContentState(displayedAt: displayStart,
                status: now < attributes.startsAt ? .upcoming : .ongoing)
            let content = ActivityContent(state: state, staleDate: displayEnd)
            if let retained { await retained.update(content) }
            else { _ = try? Activity.request(attributes: attributes, content: content, pushType: nil) }
        }
    }
}

struct WidgetIntegration: ViewModifier {
    let store: CommercialStore?
    let themes: ThemeManager
    let mock: Bool
    let controller: MeetingActivityController
    @Environment(\.scenePhase) private var scenePhase

    private func refresh() { controller.refresh(store: store, themes: themes, mock: mock) }

    func body(content: Content) -> some View {
        content
            .onChange(of: store?.loadRevision) { _, _ in refresh() }
            .onChange(of: themes.selection) { _, _ in refresh() }
            .onChange(of: scenePhase) { _, phase in if phase == .active { refresh() } }
            .task(id: store.map(ObjectIdentifier.init)) {
                refresh()
                while !Task.isCancelled {
                    let now = mock ? (store?.clock.now ?? .now) : .now
                    let deadlines = (store?.appointments ?? []).flatMap { meeting in
                        [meeting.startsAt.addingTimeInterval(-30 * 60 + 1), meeting.startsAt, meeting.endsAt].compactMap { $0 }
                    }.filter { $0 > now }
                    let delay = min(60, max(1, deadlines.min()?.timeIntervalSince(now) ?? 60))
                    do { try await Task.sleep(for: .seconds(delay)) } catch { return }
                    controller.refresh(store: store, themes: themes, mock: mock, publish: false)
                }
            }
    }
}
#endif
