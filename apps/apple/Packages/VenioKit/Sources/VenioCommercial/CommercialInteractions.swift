#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

extension View {
    func commercialRefreshable() -> some View { modifier(CommercialRefreshModifier()) }
    func commercialScrollClearance() -> some View { modifier(CommercialScrollClearance()) }
    func leadInteractions(_ lead: Lead, swipe: Bool = false, onOpen: (() -> Void)? = nil) -> some View {
        modifier(LeadInteractions(lead: lead, swipe: swipe, onOpen: onOpen))
    }
    @ViewBuilder func leadTransitionSource(_ id: String, namespace: Namespace.ID?) -> some View {
        #if os(iOS)
        if let namespace { matchedTransitionSource(id: id, in: namespace) }
        else { self }
        #else
        self
        #endif
    }
}

private struct CommercialRefreshModifier: ViewModifier {
    @Environment(\.venioSession) private var session
    @Environment(CommercialStore.self) private var store
    func body(content: Content) -> some View {
        content.refreshable {
            if let session { await session.refresh() }
            else { await store.load(force: true) }
        }
    }
}

private struct CommercialScrollClearance: ViewModifier {
    // Les écrans de connexion utilisent aussi `CommercialPage`, hors de l'environnement du store.
    @Environment(CommercialStore.self) private var store: CommercialStore?
    func body(content: Content) -> some View {
        #if os(iOS)
        content.safeAreaPadding(.bottom, store?.currentUser?.permissions.contains("manage_crm") == true ? 88 : 0)
        #else
        content
        #endif
    }
}

private struct LeadInteractions: ViewModifier {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.openURL) private var openURL
    @State private var showingStage = false
    @State private var busy = false
    @State private var errorKey: String?
    let lead: Lead
    let swipe: Bool
    let onOpen: (() -> Void)?
    private var current: Lead { store.lead(for: lead.id) ?? lead }
    private var canEdit: Bool {
        store.currentUser?.permissions.contains("manage_crm") == true && current.assignedTo == store.currentUser?.id
    }
    private var swipeFollowUp: (() -> Void)? {
        swipe && canEdit && !busy ? { followUp() } : nil
    }
    private var swipeCall: (() -> Void)? {
        swipe && canEdit && current.phoneURL != nil && !busy ? { call() } : nil
    }
    func body(content: Content) -> some View {
        content
            #if os(iOS)
            .modifier(HorizontalSwipeModifier(onRight: swipeFollowUp, onLeft: swipeCall))
            #endif
            .contextMenu {
                if let onOpen { Button(action: onOpen) { Label { VText("Ouvrir la fiche") } icon: { Image(systemName: "person.crop.rectangle") } } }
                if canEdit {
                    if current.phoneURL != nil {
                        Button(action: call) { Label { VText("Appeler") } icon: { Image(systemName: "phone") } }
                    }
                    if let url = current.emailURL {
                        Button { if canEdit { openURL(url) } } label: { Label { VText("E-mail") } icon: { Image(systemName: "envelope") } }
                    }
                    Button(action: followUp) { Label { VText("Relance demain") } icon: { Image(systemName: "clock.arrow.circlepath") } }
                        .disabled(busy)
                    Button { if canEdit { showingStage = true } } label: { Label { VText("Étape") } icon: { Image(systemName: "arrow.right.circle") } }
                }
            }
            .sheet(isPresented: $showingStage) { LeadStageSheet(lead: current) }
            .alert(CommercialStrings.text("Relance", locale: locale), isPresented: Binding(
                get: { errorKey != nil }, set: { if !$0 { errorKey = nil } })) {
                    Button { errorKey = nil } label: { VText("Fermer") }
                } message: { if let errorKey { VText(errorKey) } }
    }
    private func followUp() {
        guard canEdit, !busy else { return }
        busy = true
        Task { @MainActor in
            defer { busy = false }
            do { try await store.updateLead(id: current.id, patch: LeadPatch(nextActionAt: .set(store.clock.tomorrowMorning))) }
            catch { errorKey = mobileErrorKey(error) }
        }
    }
    private func call() {
        guard canEdit, let url = current.phoneURL else { return }
        #if os(iOS)
        store.beginCall(current)
        openURL(url) { accepted in if !accepted { store.cancelCall() } }
        #else
        openURL(url)
        #endif
    }
}

#if os(iOS)
private struct HorizontalSwipeModifier: ViewModifier {
    @Environment(\.venioPalette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @GestureState private var dragging = false
    @State private var horizontal: Bool?
    @State private var offset: CGFloat = 0
    let onRight: (() -> Void)?
    let onLeft: (() -> Void)?
    private let threshold: CGFloat = 80
    private var armed: Bool { abs(offset) >= threshold }
    func body(content: Content) -> some View {
        if onRight != nil || onLeft != nil {
            content
                .disabled(horizontal == true)
                .offset(x: offset)
                .background(alignment: offset >= 0 ? .leading : .trailing) {
                    if offset != 0 {
                        VStack(spacing: 4) {
                            Image(systemName: offset > 0 ? "clock.arrow.circlepath" : "phone.fill")
                            VText(offset > 0 ? "Relance demain" : "Appeler").lineLimit(2)
                        }
                        .font(.caption2.weight(.semibold)).foregroundStyle(palette.accentText.color)
                        .multilineTextAlignment(.center).frame(width: threshold)
                        .frame(width: abs(offset), alignment: offset > 0 ? .leading : .trailing)
                        .clipped().opacity(min(1, abs(offset) / threshold)).accessibilityHidden(true)
                    }
                }
                .clipped()
                // Le geste simultané laisse le défilement vertical au ScrollView.
                .simultaneousGesture(DragGesture(minimumDistance: 20)
                    .updating($dragging) { _, state, _ in state = true }
                    .onChanged { value in
                        if horizontal == nil {
                            horizontal = abs(value.translation.width) > abs(value.translation.height) * 1.5
                        }
                        guard horizontal == true else { return }
                        let distance = value.translation.width
                        guard distance > 0 ? onRight != nil : onLeft != nil else { offset = 0; return }
                        offset = distance.sign == .minus ? -resisted(abs(distance)) : resisted(distance)
                    }
                    .onEnded { _ in
                        let action = armed ? (offset > 0 ? onRight : onLeft) : nil
                        reset()
                        action?()
                    })
                .onChange(of: dragging) { _, active in if !active { reset() } }
                .sensoryFeedback(.impact(weight: .light), trigger: armed) { _, new in new }
        } else { content }
    }
    private func resisted(_ distance: CGFloat) -> CGFloat {
        if distance <= threshold { return distance }
        return threshold + (distance - threshold) * 0.25
    }
    private func reset() {
        horizontal = nil
        withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.78)) { offset = 0 }
    }
}
#endif
#endif
