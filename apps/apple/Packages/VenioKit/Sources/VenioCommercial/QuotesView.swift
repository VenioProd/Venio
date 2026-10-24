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
    guard let apiError = error as? VenioAPIError else { return mobileErrorKey(error) }
    switch apiError.code {
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
    @State private var errorKey: String?
    let id: String
    var body: some View {
        if let quote = store.quotes.first(where: { $0.id == id }) {
            CommercialPage {
                VStack(alignment: .leading, spacing: 10) {
                    Text(verbatim: quote.reference ?? CommercialStrings.text("Devis", locale: locale)).font(.title.bold())
                    Text(verbatim: quote.client).font(.headline)
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
                    }.venioPrimaryButton().disabled(sending)
                }
            }
        }
    }
    private func dateRow(_ key: String, date: Date) -> some View {
        HStack { VText(key); Spacer(); Text(verbatim: CommercialFormats(locale: locale).date(date, template: "dMMMyyyy")) }.font(.subheadline)
    }
}

struct NewQuoteView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.dismiss) private var dismiss
    @Environment(\.venioPalette) private var palette
    @State private var templateId = ""
    @State private var projectId: String
    @State private var savedDraft: QuoteProposal?
    @State private var busy = false
    @State private var errorKey: String?
    init(projectId: String? = nil) { _projectId = State(initialValue: projectId ?? "") }
    private var template: QuoteTemplate? { store.templates.first { $0.id == templateId } }
    private var canCreate: Bool { template != nil && store.projects.contains { $0.id == projectId && store.canQuote($0) } && store.canManageQuotes }
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
                        Button { projectId = project.id } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(verbatim: project.client + " · " + project.name)
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
                if busy { ProgressView { VText("Enregistrement") } }
                VStack(spacing: 12) {
                    Button { save(send: false) } label: { VText("Créer le brouillon").frame(maxWidth: .infinity) }
                        .buttonStyle(.bordered).disabled(!canCreate || busy || savedDraft != nil)
                    Button { save(send: true) } label: {
                        VText(savedDraft == nil ? "Créer et envoyer" : "Envoyer").frame(maxWidth: .infinity)
                    }.venioPrimaryButton().disabled(!canCreate || busy)
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
        guard !busy, canCreate else { return }
        busy = true
        errorKey = nil
        Task { @MainActor in
            defer { busy = false }
            do {
                if savedDraft == nil { savedDraft = try await store.createQuote(templateId: templateId, projectId: projectId) }
                if send, let savedDraft { try await store.sendQuote(id: savedDraft.id) }
                dismiss()
            } catch { errorKey = quoteErrorKey(error) }
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
        HStack { VText(key); Spacer(); Text(verbatim: formats.money(amount)).monospacedDigit() }.font(.headline)
    }
}
#endif
