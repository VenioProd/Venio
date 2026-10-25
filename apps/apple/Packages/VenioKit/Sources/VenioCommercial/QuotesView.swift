#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

extension QuoteStatus {
    var label: String {
        switch self {
        case .draft: "Brouillon"
        case .sent: "Envoyé"
        case .signed: "Signé"
        case .expired: "Expiré"
        case .cancelled: "Annulé"
        }
    }
}

private func quoteErrorKey(_ error: any Error) -> String {
    let code = (error as? VenioAPIError)?.code ?? (error as? HTTPFailure)?.code
    switch code {
    case "LEAD_OUT_OF_SCOPE": return "Ce lead ne fait pas partie de votre portefeuille."
    case "PROPOSAL_ALREADY_ATTACHED": return "Ce devis est déjà rattaché à un projet."
    case "PROPOSAL_NOT_ATTACHED": return "Rattachez ce devis à un projet avant de l’envoyer."
    case "PROJECT_OUT_OF_SCOPE": return "Ce projet ne fait pas partie de votre portefeuille."
    case "NOT_PROPOSAL_OWNER": return "Seul l’auteur peut envoyer ce devis."
    case "PROPOSAL_NOT_DRAFT": return "Ce devis n’est plus un brouillon."
    case "PROPOSAL_ALREADY_SIGNED": return "Ce devis est déjà signé."
    case "FORBIDDEN": return "Vous n’avez pas la permission de gérer les devis."
    default: return mobileErrorKey(error)
    }
}

public struct QuotesView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    @State private var showingNew = false
    public init() {}
    public var body: some View {
        CommercialPage {
            HStack {
                VText("Devis").font(.largeTitle.bold())
                Spacer()
                Button { showingNew = true } label: {
                    Label { VText("Nouveau devis") } icon: { Image(systemName: "plus") }
                }
                CompactQuickEntryButton()
            }
            if store.quotes.isEmpty { VText("Aucun devis") }
            ForEach(QuoteStatus.allCases, id: \.self) { status in
                let quotes = store.quotes.filter { $0.status == status }.sorted { $0.createdAt > $1.createdAt }
                if !quotes.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeading(title: status.label, count: quotes.count)
                        ForEach(quotes) { quote in
                            NavigationLink { QuoteDetailView(id: quote.id) } label: {
                                VStack(alignment: .leading, spacing: 10) {
                                    Text(verbatim: [quote.reference, quote.client].compactMap { $0 }.joined(separator: " · ")).font(.headline)
                                    Text(verbatim: CommercialStrings.text(quote.title, locale: locale))
                                        .font(.subheadline).foregroundStyle(palette.textSecondary.color)
                                    HStack {
                                        Text(verbatim: CommercialStrings.format("%@ HT", locale: locale,
                                            CommercialFormats(locale: locale).money(quote.amountHT))).font(.headline.monospacedDigit())
                                        Spacer()
                                        QuoteStatusBadge(quote: quote)
                                    }
                                }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
                            }.buttonStyle(.plain)
                        }
                    }
                }
            }
        }.navigationTitle("")
        .commercialRefreshable()
        .sheet(isPresented: $showingNew) { NewQuoteView() }
    }
}

private struct QuoteStatusBadge: View {
    @Environment(\.locale) private var locale
    let quote: QuoteProposal
    var body: some View {
        HStack {
            CommercialBadge(text: CommercialStrings.text(quote.status.label, locale: locale), tone: quote.status == .signed ? .success : .accent)
            if let date = quote.firstViewedAt {
                CommercialBadge(text: CommercialStrings.format("Vu le %@", locale: locale, CommercialFormats(locale: locale).date(date)))
            }
        }
    }
}

struct QuoteDetailView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @State private var sending = false
    @State private var attaching = false
    @State private var errorKey: String?
    let id: String
    var body: some View {
        if let quote = store.quotes.first(where: { $0.id == id }) {
            CommercialPage {
                VStack(alignment: .leading, spacing: 10) {
                    Text(verbatim: quote.reference ?? CommercialStrings.text("Devis", locale: locale)).font(.title.bold())
                    Text(verbatim: quote.client ?? store.leads.first(where: { $0.id == quote.leadId })?.company ?? "").font(.headline)
                    Text(verbatim: CommercialStrings.text(quote.title, locale: locale))
                    QuoteStatusBadge(quote: quote)
                }
                QuoteLinesView(lines: quote.lines)
                VStack(alignment: .leading, spacing: 12) {
                    dateRow("Créé le", date: quote.createdAt)
                    dateRow("Mis à jour le", date: quote.updatedAt)
                    if let date = quote.expiresAt { dateRow("Valable jusqu’au", date: date) }
                    if let date = quote.firstViewedAt { dateRow("Vu le", date: date) }
                    if let date = quote.signature.signedAt { dateRow("Signé le", date: date) }
                }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
                if let errorKey { MobileErrorView(key: errorKey).accessibilityAddTraits(.updatesFrequently) }
                if quote.status == .draft && store.canManageQuotes && (quote.createdBy == store.currentUser?.id || store.currentUser?.permissions.contains("manage_billing") == true) {
                    if quote.project == nil {
                        Button { attaching = true } label: { VText("Rattacher à un projet") }.buttonStyle(.bordered)
                        VText("Rattachez ce devis à un projet avant de l’envoyer.").font(.caption)
                    }
                    Button {
                        sending = true
                        errorKey = nil
                        Task { @MainActor in
                            defer { sending = false }
                            do { try await store.sendQuote(id: quote.id) }
                            catch { errorKey = quoteErrorKey(error) }
                        }
                    } label: {
                        HStack { if sending { ProgressView() }; VText("Envoyer") }
                    }.venioPrimaryButton().disabled(sending || quote.project == nil)
                }
            }
            .sheet(isPresented: $attaching) { AttachQuoteView(quoteId: quote.id) }
        }
    }
    private func dateRow(_ key: String, date: Date) -> some View {
        HStack { VText(key); Spacer(); Text(verbatim: CommercialFormats(locale: locale).date(date, template: "dMMMyyyy")) }.font(.subheadline)
    }
}

private struct AttachQuoteView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var errorKey: String?
    let quoteId: String
    var body: some View {
        NavigationStack {
            CommercialPage {
                ForEach(store.projects.filter(\.canQuote)) { project in
                    Button {
                        busy = true
                        Task { @MainActor in
                            defer { busy = false }
                            do { try await store.attachQuote(id: quoteId, projectId: project.id); dismiss() }
                            catch { errorKey = quoteErrorKey(error) }
                        }
                    } label: { Text(verbatim: project.clientName + " · " + project.name) }
                }
                if !store.projects.contains(where: \.canQuote) { VText("Aucun projet dans votre portefeuille") }
                if let errorKey { MobileErrorView(key: errorKey) }
            }
            .disabled(busy)
            .navigationTitle(CommercialStrings.text("Rattacher à un projet", locale: locale))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { VText("Fermer") }.disabled(busy) } }
        }.interactiveDismissDisabled(busy)
    }
}

struct NewQuoteView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.dismiss) private var dismiss
    @Environment(\.venioPalette) private var palette
    @State private var templateId = ""
    @State private var projectId: String
    @State private var leadId: String
    @State private var savedDraft: QuoteProposal?
    @State private var busy = false
    @State private var errorKey: String?
    init(projectId: String? = nil, leadId: String? = nil) {
        _projectId = State(initialValue: projectId ?? "")
        _leadId = State(initialValue: leadId ?? "")
    }
    private var template: QuoteTemplate? { store.templates.first { $0.id == templateId } }
    private var canCreate: Bool {
        let projectAllowed = store.projects.contains { $0.id == projectId && $0.canQuote }
        let leadAllowed = store.leads.contains { $0.id == leadId && $0.canQuote }
        return template != nil && (projectAllowed || leadAllowed) && store.canManageQuotes
    }
    private var canSend: Bool { leadId.isEmpty && (savedDraft == nil || savedDraft?.project != nil) }
    var body: some View {
        NavigationStack {
            CommercialPage {
                VStack(alignment: .leading, spacing: 12) {
                    VText("Modèle").font(.headline)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        ForEach(store.templates) { item in
                            Button { templateId = item.id } label: {
                                HStack {
                                    VText(item.name).font(.subheadline.weight(.semibold))
                                    Spacer()
                                    if item.id == templateId { Image(systemName: "checkmark.circle.fill").accessibilityHidden(true) }
                                }.frame(maxWidth: .infinity, minHeight: 46).padding(12)
                                    .background(palette.accent.color.opacity(item.id == templateId ? 0.2 : 0.06), in: RoundedRectangle(cornerRadius: 16))
                            }.buttonStyle(.plain)
                                .accessibilityAddTraits(item.id == templateId ? .isSelected : [])
                        }
                    }
                    VText("Destinataire · projet").font(.headline)
                    ForEach(store.projects) { project in
                        Button { projectId = project.id; leadId = "" } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(verbatim: project.clientName + " · " + project.name)
                                    if !store.canQuote(project) {
                                        VText("Vous devez être responsable du projet ou propriétaire du compte client.").font(.caption)
                                    }
                                }
                                Spacer()
                                if project.id == projectId { Image(systemName: "checkmark.circle.fill") }
                            }
                        }.buttonStyle(.plain).disabled(!store.canQuote(project))
                            .foregroundStyle(store.canQuote(project) ? palette.textPrimary.color : palette.textSecondary.color)
                            .opacity(store.canQuote(project) ? 1 : 0.55)
                    }
                    if store.projects.isEmpty { VText("Aucun projet dans votre portefeuille") }
                    VText("Destinataire · lead").font(.headline)
                    ForEach(store.leads.filter { $0.status.isOpen }) { lead in
                        Button { leadId = lead.id; projectId = "" } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(verbatim: lead.company + " · " + lead.contactName)
                                    if !lead.canQuote {
                                        VText("Aucun projet lié dans votre portefeuille. Vous devez être responsable du projet ou propriétaire du compte client.").font(.caption)
                                    }
                                }
                                Spacer()
                                if lead.id == leadId { Image(systemName: "checkmark.circle.fill") }
                            }
                        }.buttonStyle(.plain).disabled(!lead.canQuote)
                            .foregroundStyle(lead.canQuote ? palette.textPrimary.color : palette.textSecondary.color)
                    }
                }.disabled(busy || savedDraft != nil)
                if let template {
                    if let expires = store.clock.calendar.date(byAdding: .day, value: template.validityDays, to: store.clock.now) {
                        Text(verbatim: CommercialStrings.format("Valable jusqu’au %@", locale: locale,
                            CommercialFormats(locale: locale).date(expires, template: "dMMMyyyy"))).font(.subheadline)
                    }
                    QuoteLinesView(lines: template.lines)
                }
                if let errorKey { MobileErrorView(key: errorKey) }
                if savedDraft != nil { VText("Brouillon créé. Vous pouvez reprendre l’envoi depuis Devis.").font(.subheadline) }
                if !canSend { VText("Rattachez ce devis à un projet avant de l’envoyer.").font(.caption) }
                if busy { ProgressView { VText("Enregistrement") } }
                VStack(spacing: 12) {
                    Button { save(send: false) } label: { VText("Créer le brouillon").frame(maxWidth: .infinity) }
                        .buttonStyle(.bordered).disabled(!canCreate || busy || savedDraft != nil)
                    Button { save(send: true) } label: {
                        VText(savedDraft == nil ? "Créer et envoyer" : "Envoyer").frame(maxWidth: .infinity)
                    }.venioPrimaryButton().disabled(!canCreate || !canSend || busy)
                }
            }
            .navigationTitle(CommercialStrings.text("Nouveau devis", locale: locale))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { VText("Fermer") }.disabled(busy)
                }
            }
        }
        .interactiveDismissDisabled(busy)
        .onAppear { if templateId.isEmpty { templateId = store.templates.first?.id ?? "" } }
    }
    private func save(send: Bool) {
        guard !busy, canCreate, !send || canSend else { return }
        busy = true
        errorKey = nil
        Task { @MainActor in
            defer { busy = false }
            do {
                if savedDraft == nil { savedDraft = try await store.createQuote(templateId: templateId, projectId: projectId.isEmpty ? nil : projectId, leadId: leadId.isEmpty ? nil : leadId) }
                if send, let savedDraft { try await store.sendQuote(id: savedDraft.id) }
                dismiss()
            } catch {
                errorKey = quoteErrorKey(error)
            }
        }
    }
}

private struct QuoteLinesView: View {
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    let lines: [QuoteLine]
    private var formats: CommercialFormats { CommercialFormats(locale: locale) }
    private var total: Decimal { lines.filter { !$0.isOptional }.reduce(0) { $0 + $1.quantity * $1.unitPrice } }
    private var tax: Decimal { lines.filter { !$0.isOptional }.reduce(0) { $0 + $1.quantity * $1.unitPrice * $1.taxRate / 100 } }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .top) {
                        Text(verbatim: CommercialStrings.text(line.description, locale: locale))
                        Spacer()
                        Text(verbatim: formats.money(line.quantity * line.unitPrice)).monospacedDigit()
                    }.font(.subheadline)
                    Text(verbatim: CommercialStrings.format("%@ × %@ · TVA %@", locale: locale,
                        line.quantity.formatted(.number.locale(locale)), formats.money(line.unitPrice), formats.percent(line.taxRate / 100)))
                        .font(.caption).foregroundStyle(palette.textSecondary.color)
                    if line.isOptional { VText("Option non incluse").font(.caption) }
                }
                Divider()
            }
            totalRow("Total HT", amount: total)
            let rates = Set(lines.filter { !$0.isOptional }.map(\.taxRate))
            totalRow(rates == [20] ? "TVA 20 %" : "TVA", amount: tax)
            totalRow("Total TTC", amount: total + tax)
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
    }
    private func totalRow(_ key: String, amount: Decimal) -> some View {
        HStack { VText(key); Spacer(); Text(verbatim: formats.money(amount)).monospacedDigit() }
            .font(.headline).contentTransition(.numericText()).animation(.smooth, value: amount)
    }
}
#endif
