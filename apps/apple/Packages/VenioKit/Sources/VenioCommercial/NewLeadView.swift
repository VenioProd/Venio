#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

struct NewLeadView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.dismiss) private var dismiss
    #if os(iOS)
    @State private var tab = "Carte"
    private let tabs = ["Carte", "Saisie", "Voix"]
    #else
    @State private var tab = "Saisie"
    private let tabs = ["Saisie", "Voix"]
    #endif
    @State private var draft = LeadDraft()
    @State private var jobTitle = ""
    @State private var website = ""
    @State private var capture = VoiceCapture()
    @State private var busy = false
    @State private var errorKey: String?
    @State private var fromCard = false
    let onCreated: (String) -> Void
    var body: some View {
        NavigationStack {
            CommercialPage {
                Picker(CommercialStrings.text("Saisie rapide", locale: locale), selection: $tab) {
                    ForEach(tabs, id: \.self) { item in VText(item).tag(item) }
                }.pickerStyle(.segmented)
                #if os(iOS)
                if tab == "Carte" {
                    BusinessCardScanner { card in
                        draft.company = card.company
                        draft.contactName = card.contactName
                        draft.contactEmail = card.contactEmail
                        draft.contactPhone = card.contactPhone
                        jobTitle = card.jobTitle
                        website = card.website
                        fromCard = true
                    }
                }
                #endif
                if tab == "Voix" { VoiceCaptureView(capture: capture) }
                field("Entreprise", text: $draft.company)
                field("Contact", text: $draft.contactName)
                field("E-mail", text: $draft.contactEmail)
                field("Téléphone", text: $draft.contactPhone)
                field("Fonction", text: $jobTitle)
                field("Site web", text: $website)
                field("Prestation", text: $draft.serviceType)
                TextField(CommercialStrings.text("Budget", locale: locale), value: $draft.budget, format: Decimal.FormatStyle.number.locale(locale))
                    .textFieldStyle(.roundedBorder)
                VText("Notes").font(.headline)
                TextEditor(text: $draft.notes).frame(minHeight: 100).accessibilityLabel(CommercialStrings.text("Notes", locale: locale))
                if fromCard { VText("Source : carte de visite").font(.caption) }
                if let errorKey { MobileErrorView(key: errorKey) }
                Button { save() } label: {
                    if busy { ProgressView() } else { VText("Créer le lead") }
                }.venioPrimaryButton()
                    .disabled(busy || capture.preparing || capture.transcribing || capture.startedAt != nil || draft.company.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .disabled(busy)
            .navigationTitle(CommercialStrings.text("Nouveau lead", locale: locale))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { VText("Fermer") }.disabled(busy) } }
        }.interactiveDismissDisabled(busy)
            .onDisappear { capture.discard() }
    }
    private func field(_ key: String, text: Binding<String>) -> some View {
        TextField(CommercialStrings.text(key, locale: locale), text: text).textFieldStyle(.roundedBorder)
    }
    private func save() {
        guard !busy else { return }
        var value = draft
        value.assignedTo = store.currentUser?.id
        value.source = CommercialStrings.text(fromCard ? "lead.source.businessCard" : "Saisie rapide", locale: locale)
        let details = [("Fonction", jobTitle), ("Site web", website)].filter { !$0.1.isEmpty }
            .map { CommercialStrings.text($0.0, locale: locale) + " : " + $0.1 }
        value.notes = ([draft.notes, capture.text] + details).filter { !$0.isEmpty }.joined(separator: "\n")
        busy = true
        errorKey = nil
        Task { @MainActor in
            defer { busy = false }
            do {
                let lead = try await store.createLead(value)
                dismiss()
                onCreated(lead.id)
            } catch { errorKey = mobileErrorKey(error) }
        }
    }
}
#endif
