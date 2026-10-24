#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

struct VoiceCaptureView: View {
    @Environment(\.locale) private var locale
    @Environment(\.openURL) private var openURL
    @Bindable var capture: VoiceCapture
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let seconds = Int(capture.startedAt.map { context.date.timeIntervalSince($0) } ?? capture.duration)
                let duration = String(format: "%d:%02d", max(0, seconds) / 60, max(0, seconds) % 60)
                Text(verbatim: CommercialStrings.format("Durée : %@", locale: locale, duration)).monospacedDigit()
            }
            if capture.startedAt != nil {
                Button { capture.stop(locale: locale) } label: { Label { VText("Arrêter") } icon: { Image(systemName: "stop.fill") } }
            } else {
                Button { Task { await capture.start(locale: locale) } } label: {
                    Label { VText("Enregistrer une note vocale") } icon: { Image(systemName: "mic.fill") }
                }.disabled(capture.preparing || capture.transcribing)
            }
            if capture.audioURL != nil && capture.startedAt == nil {
                Button { capture.play() } label: { Label { VText("Réécouter") } icon: { Image(systemName: "play.fill") } }
            }
            if capture.preparing || capture.transcribing { ProgressView { VText("Préparation de la transcription") } }
            if let key = capture.errorKey { VText(key).font(.callout) }
            if capture.needsSettings { Button { if let url = permissionSettingsURL { openURL(url) } } label: { VText("Ouvrir Réglages") } }
            VText("Transcription modifiable").font(.headline)
            TextEditor(text: $capture.text).frame(minHeight: 120)
                .accessibilityLabel(CommercialStrings.text("Transcription modifiable", locale: locale))
                .disabled(capture.startedAt != nil || capture.transcribing)
        }
    }
}

var permissionSettingsURL: URL? {
    #if os(iOS)
    URL(string: UIApplication.openSettingsURLString)
    #else
    URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
    #endif
}

struct VoiceNoteView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale
    @State private var capture = VoiceCapture()
    @State private var busy = false
    @State private var saved = false
    @State private var failed = false
    @State private var key = UUID()
    @State private var occurredAt = Date.now
    let lead: Lead
    var body: some View {
        NavigationStack {
            CommercialPage {
                Text(verbatim: lead.company).font(.headline)
                VoiceCaptureView(capture: capture).disabled(busy)
                if failed { VText("Écriture impossible. Réessayez.") }
                Button {
                    busy = true
                    failed = false
                    let draft = InteractionDraft(idempotencyKey: key, subjectType: .lead, subjectId: lead.id,
                        kind: .note, body: capture.text, lang: ContentLanguage.detect(capture.text), direction: .none,
                        occurredAt: occurredAt, audioFileURL: capture.audioURL)
                    Task { @MainActor in
                        defer { busy = false }
                        do { try await store.createInteraction(draft); saved = true; dismiss() }
                        catch { failed = true }
                    }
                } label: { if busy { ProgressView() } else { VText("Enregistrer") } }
                    .venioPrimaryButton()
                    .disabled(busy || capture.preparing || capture.transcribing || capture.startedAt != nil || capture.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .navigationTitle(CommercialStrings.text("Note vocale", locale: locale))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { VText("Fermer") }.disabled(busy) } }
        }.interactiveDismissDisabled(busy)
            .onChange(of: capture.text) { _, _ in key = UUID() }
            .onChange(of: capture.audioURL) { _, _ in key = UUID() }
            .onDisappear { capture.discard(keepAudio: saved) }
    }
}
#endif
