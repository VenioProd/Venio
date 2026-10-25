#if !os(watchOS)
import SwiftUI
import Observation
import VenioCore
import VenioTheme
#if os(iOS)
import MessageUI
#endif

enum MessageModel: String, CaseIterable, Identifiable {
    case exchange, quote, meeting
    var id: String { rawValue }
    var title: String {
        switch self {
        case .exchange: "Suite à un échange"
        case .quote: "Relance de devis"
        case .meeting: "Proposition de rendez-vous"
        }
    }
    func template(locale: Locale) -> MessageTemplate {
        let subject: String
        let body: String
        switch self {
        case .exchange:
            subject = "Suite à notre échange — {{company}}"
            body = "Bonjour {{firstName}},\n\nMerci pour notre échange au sujet de {{company}}. Je reste à votre disposition pour la suite.\n\nBien cordialement,\n{{sender}}"
        case .quote:
            subject = "Votre devis — {{company}}"
            body = "Bonjour {{firstName}},\n\nAvez-vous pu consulter notre devis pour {{company}} ? Je suis disponible pour en discuter et répondre à vos questions.\n\nBien cordialement,\n{{sender}}"
        case .meeting:
            subject = "Un rendez-vous pour {{company}}"
            body = "Bonjour {{firstName}},\n\nJe vous propose un rendez-vous pour faire le point sur les besoins de {{company}}. Quelles seraient vos disponibilités ?\n\nBien cordialement,\n{{sender}}"
        }
        return MessageTemplate(id: id, subject: CommercialStrings.text(subject, locale: locale), body: CommercialStrings.text(body, locale: locale))
    }
}

@Observable @MainActor final class MessageTemplates {
    static let shared = MessageTemplates()
    private var overrides: [String: MessageTemplate]
    private let storageKey = "venio.messageTemplates"
    private init() {
        overrides = UserDefaults.standard.data(forKey: "venio.messageTemplates")
            .flatMap { try? JSONDecoder().decode([String: MessageTemplate].self, from: $0) } ?? [:]
    }
    private func key(_ model: MessageModel, locale: Locale) -> String {
        (locale.language.languageCode?.identifier == "fr" ? "fr" : "en") + "." + model.id
    }
    func template(_ model: MessageModel, locale: Locale) -> MessageTemplate {
        overrides[key(model, locale: locale)] ?? model.template(locale: locale)
    }
    func save(_ template: MessageTemplate, model: MessageModel, locale: Locale) {
        overrides[key(model, locale: locale)] = template == model.template(locale: locale) ? nil : template
        persist()
    }
    func reset(_ model: MessageModel, locale: Locale) {
        overrides.removeValue(forKey: key(model, locale: locale))
        persist()
    }
    private func persist() {
        if let data = try? JSONEncoder().encode(overrides) { UserDefaults.standard.set(data, forKey: storageKey) }
    }
}

struct MessageTemplatesSettings: View {
    @Environment(\.locale) private var locale
    @State private var templates = MessageTemplates.shared
    var body: some View {
        List(MessageModel.allCases) { model in
            NavigationLink {
                MessageTemplateEditor(model: model, draft: templates.template(model, locale: locale), language: locale)
            } label: { VText(model.title) }
        }
        .scrollContentBackground(.hidden).background { ThemedBackground() }
        .navigationTitle(CommercialStrings.text("Modèles de messages", locale: locale))
    }
}

private struct MessageTemplateEditor: View {
    let model: MessageModel
    @State var draft: MessageTemplate
    let language: Locale
    var body: some View {
        Form {
            TextField(CommercialStrings.text("Objet", locale: language), text: $draft.subject)
            TextEditor(text: $draft.body).frame(minHeight: 220)
                .accessibilityLabel(CommercialStrings.text("Message", locale: language))
            VText("Variables : {{firstName}}, {{company}}, {{sender}}")
                .font(.caption)
            Button {
                MessageTemplates.shared.reset(model, locale: language)
                draft = model.template(locale: language)
            } label: { VText("Remettre à zéro") }
        }
        .scrollContentBackground(.hidden).background { ThemedBackground() }
        .navigationTitle(CommercialStrings.text(model.title, locale: language))
        .onChange(of: draft) { _, value in MessageTemplates.shared.save(value, model: model, locale: language) }
    }
}

enum FollowUpChannel: String, Identifiable {
    case email, sms
    var id: String { rawValue }
    var title: String { self == .email ? "Relancer par e-mail" : "Relancer par SMS" }
}

struct MessageFollowUpView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    let leadID: String
    let channel: FollowUpChannel
    @State private var model = MessageModel.exchange
    @State private var subject = ""
    @State private var bodyText = ""
    @State private var composing = false
    @State private var sent = false
    @State private var confirmation = false
    @State private var busy = false
    @State private var errorKey: String?
    @State private var key = UUID()
    @State private var sentAt = Date.now
    private var lead: Lead? { store.lead(for: leadID) }
    private var allowed: Bool { lead.map { store.canEditLead($0) } == true }
    private var canCompose: Bool {
        guard allowed, let lead else { return false }
        return channel == .email ? lead.emailURL != nil : lead.phoneURL != nil
    }
    var body: some View {
        NavigationStack {
            Form {
                Picker(CommercialStrings.text("Modèle", locale: locale), selection: $model) {
                    ForEach(MessageModel.allCases) { VText($0.title).tag($0) }
                }
                if channel == .email { TextField(CommercialStrings.text("Objet", locale: locale), text: $subject) }
                TextEditor(text: $bodyText).frame(minHeight: 220)
                    .accessibilityLabel(CommercialStrings.text("Message", locale: locale))
                if let errorKey { MobileErrorView(key: errorKey) }
                Button { compose() } label: { VText("Continuer vers le compositeur") }
                    .disabled(!canCompose || bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
            }
            .scrollContentBackground(.hidden).background { ThemedBackground() }
            .navigationTitle(CommercialStrings.text(channel.title, locale: locale))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { VText("Fermer") }.disabled(busy) } }
        }
        .task { render() }
        .onChange(of: model) { _, _ in render() }
        .interactiveDismissDisabled(busy)
        #if os(iOS)
        .sheet(isPresented: $composing, onDismiss: { if sent { confirmation = true } }) {
            if let lead {
                if channel == .email {
                    MailComposer(recipient: lead.contactEmail, subject: subject, text: bodyText) { finish(sent: $0) }
                        .ignoresSafeArea()
                } else {
                    SMSComposer(recipient: lead.contactPhone, text: bodyText) { finish(sent: $0) }
                        .ignoresSafeArea()
                }
            }
        }
        #endif
        .alert(CommercialStrings.text("Enregistrer l’interaction ?", locale: locale), isPresented: $confirmation) {
            Button { save() } label: { VText("Enregistrer") }
            Button(role: .cancel) { dismiss() } label: { VText("Annuler") }
        }
    }
    private func render() {
        guard let lead else { return }
        let rendered = MessageTemplates.shared.template(model, locale: locale).rendered(contactName: lead.contactName,
            company: lead.company, sender: store.currentUser?.name ?? "", missingFirstName: CommercialStrings.text("à vous", locale: locale))
        subject = rendered.subject
        bodyText = rendered.body
    }
    private func compose() {
        guard canCompose, let lead else { return }
        #if os(iOS)
        if channel == .email ? MFMailComposeViewController.canSendMail() : MFMessageComposeViewController.canSendText() {
            sent = false
            composing = true
            return
        }
        #endif
        var components = URLComponents()
        components.scheme = channel == .email ? "mailto" : "sms"
        components.path = channel == .email ? lead.contactEmail : lead.contactPhone
        components.queryItems = channel == .email ? [URLQueryItem(name: "subject", value: subject), URLQueryItem(name: "body", value: bodyText)] : [URLQueryItem(name: "body", value: bodyText)]
        if let url = components.url { openURL(url) { accepted in if accepted { dismiss() } } }
    }
    private func finish(sent: Bool) {
        self.sent = sent
        sentAt = .now
        composing = false
    }
    private func save() {
        guard sent, allowed, let lead else { return }
        busy = true
        errorKey = nil
        let draft = InteractionDraft(idempotencyKey: key, subjectType: .lead, subjectId: lead.id, kind: .note,
            body: bodyText, lang: locale.language.languageCode?.identifier, direction: .outgoing,
            occurredAt: sentAt, subject: channel == .email ? subject : CommercialStrings.text("SMS", locale: locale))
        Task {
            defer { busy = false }
            do { _ = try await store.createInteraction(draft); dismiss() }
            catch { errorKey = mobileErrorKey(error); confirmation = true }
        }
    }
}

#if os(iOS)
private struct MailComposer: UIViewControllerRepresentable {
    let recipient: String
    let subject: String
    let text: String
    let completion: (Bool) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(completion: completion) }
    func makeUIViewController(context: Context) -> MFMailComposeViewController {
        let controller = MFMailComposeViewController()
        controller.setToRecipients([recipient]); controller.setSubject(subject); controller.setMessageBody(text, isHTML: false)
        controller.mailComposeDelegate = context.coordinator
        return controller
    }
    func updateUIViewController(_ controller: MFMailComposeViewController, context: Context) {}
    final class Coordinator: NSObject, MFMailComposeViewControllerDelegate {
        let completion: (Bool) -> Void
        init(completion: @escaping (Bool) -> Void) { self.completion = completion }
        func mailComposeController(_ controller: MFMailComposeViewController, didFinishWith result: MFMailComposeResult, error: (any Error)?) {
            completion(result == .sent && error == nil)
        }
    }
}
private struct SMSComposer: UIViewControllerRepresentable {
    let recipient: String
    let text: String
    let completion: (Bool) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(completion: completion) }
    func makeUIViewController(context: Context) -> MFMessageComposeViewController {
        let controller = MFMessageComposeViewController()
        controller.recipients = [recipient]; controller.body = text
        controller.messageComposeDelegate = context.coordinator
        return controller
    }
    func updateUIViewController(_ controller: MFMessageComposeViewController, context: Context) {}
    final class Coordinator: NSObject, MFMessageComposeViewControllerDelegate {
        let completion: (Bool) -> Void
        init(completion: @escaping (Bool) -> Void) { self.completion = completion }
        func messageComposeViewController(_ controller: MFMessageComposeViewController, didFinishWith result: MessageComposeResult) {
            completion(result == .sent)
        }
    }
}
#endif
#endif
