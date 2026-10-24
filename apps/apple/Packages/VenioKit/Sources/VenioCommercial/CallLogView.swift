#if os(iOS)
import SwiftUI
import VenioCore
import VenioTheme

struct CallAttempt: Identifiable {
    let id = UUID()
    let lead: Lead
    let startedAt = Date.now
    var leftAt: Date?
    var duration: TimeInterval = 0
}

struct CallLogView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.dismiss) private var dismiss
    @State private var capture = VoiceCapture()
    @State private var busy = false
    @State private var failed = false
    @State private var key = UUID()
    let call: CallAttempt
    private var description: String {
        let duration = Duration.seconds(call.duration).formatted(.time(pattern: .minuteSecond))
        return CommercialStrings.format("Appel sortant · durée estimée %@", locale: locale, duration)
    }
    var body: some View {
        NavigationStack {
            CommercialPage {
                Text(verbatim: CommercialStrings.format("Enregistrer l’appel avec %@ ?", locale: locale, call.lead.contactName)).font(.title2)
                Text(verbatim: description)
                VText("Résumé facultatif, écrit ou dicté")
                VoiceCaptureView(capture: capture)
                if failed { VText("Écriture impossible. Réessayez.") }
                Button {
                    busy = true
                    failed = false
                    let body = capture.text.trimmingCharacters(in: .whitespacesAndNewlines)
                    let draft = InteractionDraft(idempotencyKey: key, subjectType: .lead, subjectId: call.lead.id,
                        kind: .call, body: body.isEmpty ? description : body, lang: ContentLanguage.detect(body),
                        direction: .outgoing, occurredAt: call.startedAt, subject: description)
                    Task { @MainActor in
                        defer { busy = false }
                        do { try await store.createInteraction(draft); dismiss() }
                        catch { failed = true }
                    }
                } label: { VText("Enregistrer") }.venioPrimaryButton()
                    .disabled(busy || capture.preparing || capture.transcribing || capture.startedAt != nil)
                Button { dismiss() } label: { VText("Ignorer") }.disabled(busy)
            }.disabled(busy)
        }.interactiveDismissDisabled(busy)
            .onChange(of: capture.text) { _, _ in key = UUID() }
            .onDisappear { capture.discard() }
    }
}
#endif
