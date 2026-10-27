#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

struct ProjectsTab: View {
    @Environment(CommercialStore.self) private var store
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
    #endif
    @State private var selectedProjectID: String?
    @State private var path: [String]
    init(initialProjectID: String? = nil) {
        _selectedProjectID = State(initialValue: initialProjectID)
        _path = State(initialValue: initialProjectID.map { [$0] } ?? [])
    }
    private var regular: Bool {
        #if os(iOS)
        sizeClass == .regular
        #else
        true
        #endif
    }
    var body: some View {
        Group {
            if regular {
                NavigationSplitView {
                    ProjectsView(selectedID: selectedProjectID) { selectedProjectID = $0 }
                        .navigationSplitViewColumnWidth(min: 280, ideal: 340, max: 400)
                } detail: {
                    if let selectedProjectID { ProjectDetailView(id: selectedProjectID) }
                    else { ProjectsView { selectedProjectID = $0 } }
                }
            } else {
                NavigationStack(path: $path) {
                    ProjectsView { path.append($0) }
                        .navigationDestination(for: String.self) { ProjectDetailView(id: $0) }
                }
            }
        }
        .onChange(of: store.projects.map(\.id), initial: true) { _, ids in
            if selectedProjectID == nil { selectedProjectID = ids.first }
        }
    }
}

public struct ProjectsView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    @State private var quoteProject: Project?
    @State private var acquisition = DocumentAcquisition()
    private let selectedID: String?
    private let onProject: (String) -> Void
    public init(selectedID: String? = nil, onProject: @escaping (String) -> Void = { _ in }) {
        self.selectedID = selectedID
        self.onProject = onProject
    }
    private var formats: CommercialFormats { CommercialFormats(locale: locale) }
    public var body: some View {
        CommercialPage {
            HStack {
                VText("Projets").font(.largeTitle.bold())
                Spacer()
                CompactQuickEntryButton()
            }
            ForEach(store.projects) { project in
                Button { onProject(project.id) } label: {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(verbatim: project.clientName).font(.title3.bold())
                        Text(verbatim: project.projectNumber + " · " + CommercialStrings.text(project.name, locale: locale)).font(.subheadline)
                        if store.currentUser?.permissions.contains("view_phases") == true, let detail = store.projectDetails[project.id], let phase = detail.phases.first(where: { $0.status == .active }) {
                            Text(verbatim: CommercialStrings.text(phase.title, locale: locale) + " · " +
                                CommercialStrings.format("Phase %lld sur %lld", locale: locale, phase.order, detail.phases.count))
                                .font(.subheadline)
                        }
                        ProgressView(value: Double(project.progress), total: 100) {
                            Text(verbatim: formats.percent(Decimal(project.progress) / 100))
                        }
                        if let date = project.endDate {
                            Text(verbatim: CommercialStrings.format("Livraison %@", locale: locale, formats.date(date, template: "dMMMyyyy"))).font(.caption)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
                        .overlay {
                            if project.id == selectedID {
                                RoundedRectangle(cornerRadius: 22).strokeBorder(palette.accent.color, lineWidth: 1)
                            }
                        }
                }.buttonStyle(.plain).accessibilityAddTraits(project.id == selectedID ? .isSelected : [])
                    .contextMenu {
                        Button { onProject(project.id) } label: { Label { VText("Ouvrir") } icon: { Image(systemName: "folder") } }
                        Menu { DocumentSourceActions(acquisition: acquisition, projectId: project.id) } label: {
                            Label { VText("Ajouter un document") } icon: { Image(systemName: "doc.badge.plus") }
                        }.disabled(!store.canManageDocuments)
                        if store.canManageQuotes && project.canQuote {
                            Button { quoteProject = project } label: { Label { VText("Nouveau devis") } icon: { Image(systemName: "doc.badge.plus") } }
                        }
                    }
            }
        }
        .commercialRefreshable()
        .documentAcquisition(acquisition)
        .sheet(item: $quoteProject) { NewQuoteView(projectId: $0.id) }
        .navigationTitle("")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }
}

public struct ProjectDetailView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    @State private var acquisition = DocumentAcquisition()
    let id: String
    public init(id: String) { self.id = id }
    private var formats: CommercialFormats { CommercialFormats(locale: locale) }
    public var body: some View {
        Group {
            if let detail = store.projectDetails[id] {
                CommercialPage {
                    header(detail)
                    if store.currentUser?.permissions.contains("view_phases") == true { phases(detail) }
                    ProjectDocumentsView(projectId: id)
                    finances(detail.project)
                    requests(detail)
                    VStack(alignment: .leading, spacing: 18) {
                        SectionHeading(title: "Fil des mises à jour client", count: detail.updates.count)
                        ForEach(detail.updates.sorted { $0.createdAt > $1.createdAt }) { update in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(verbatim: formats.date(update.createdAt)).font(.caption).foregroundStyle(palette.textSecondary.color)
                                TranslatableText(update.title, preserving: store.contentIdentifiers)
                                if !update.description.isEmpty { TranslatableText(update.description, preserving: store.contentIdentifiers) }
                                Text(verbatim: CommercialStrings.text("Publié au client", locale: locale) + " · " + CommercialStrings.text(update.author, locale: locale)).font(.caption)
                            }
                            Divider()
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
                }
                .navigationTitle("")
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
            } else {
                ContentUnavailableView(CommercialStrings.text("Projet indisponible", locale: locale), systemImage: "folder.badge.questionmark")
            }
        }.background { ThemedBackground() }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu { DocumentSourceActions(acquisition: acquisition, projectId: id) } label: {
                    Label { VText("Ajouter un document") } icon: { Image(systemName: "plus") }
                }.disabled(!store.canManageDocuments)
            }
        }
        .dropDestination(for: URL.self) { urls, _ in
            guard store.canManageDocuments, !urls.isEmpty else { return false }
            acquisition.files(urls, projectId: id)
            return true
        }
        .documentAcquisition(acquisition)
    }
    private func header(_ detail: ProjectDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(verbatim: detail.project.clientName).font(.largeTitle.bold())
            Text(verbatim: detail.project.projectNumber + " · " + CommercialStrings.text(detail.project.name, locale: locale)).font(.subheadline)
            ProgressView(value: Double(detail.project.progress), total: 100) {
                VText("Avancement")
            } currentValueLabel: { Text(verbatim: formats.percent(Decimal(detail.project.progress) / 100)) }
            if store.currentUser?.permissions.contains("view_phases") == true, let phase = detail.phases.first(where: { $0.status == .active }) {
                VText("Phase en cours").font(.caption)
                Text(verbatim: CommercialStrings.text(phase.title, locale: locale)).font(.title3.bold())
                Text(verbatim: CommercialStrings.format("Phase %lld sur %lld", locale: locale, phase.order, detail.phases.count))
            }
            if let date = detail.project.endDate {
                Text(verbatim: CommercialStrings.format("Livraison %@", locale: locale, formats.date(date, template: "dMMMyyyy")))
            }
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
    }
    private func phases(_ detail: ProjectDetail) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(detail.phases.sorted { $0.order < $1.order }) { phase in
                HStack(spacing: 12) {
                    Image(systemName: phase.status == .completed ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(phase.status == .completed ? palette.success.color : palette.accentText.color)
                        .accessibilityHidden(true)
                    Text(verbatim: formats.number(phase.order) + " · " + CommercialStrings.text(phase.title, locale: locale))
                        .font(phase.status == .active ? .headline : .body)
                    Spacer()
                    VText(phase.status.label).font(.caption)
                }.accessibilityElement(children: .combine)
            }
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
    }
    private func finances(_ project: Project) -> some View {
        let budget = project.budget.amount ?? 0
        let invoiced = project.billing.amountInvoiced ?? 0
        return VStack(alignment: .leading, spacing: 14) {
            VText("Finances").font(.headline)
            LabeledContent { Text(verbatim: formats.money(budget)) } label: { VText("Budget") }
            LabeledContent { Text(verbatim: formats.money(invoiced)) } label: { VText("Facturé") }
            LabeledContent { Text(verbatim: formats.money(budget - invoiced)) } label: { VText("Reste à facturer") }
            Text(verbatim: CommercialStrings.format("%@ du budget facturé", locale: locale, formats.percent(budget > 0 ? invoiced / budget : 0)))
            CommercialBadge(text: CommercialStrings.text(project.billing.billingStatus.label, locale: locale), tone: .warning)
        }.venioCard()
    }
    private func requests(_ detail: ProjectDetail) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeading(title: "Demandes et tickets", count: detail.requests.count + detail.tickets.count)
            ForEach(detail.requests) { request in
                VStack(alignment: .leading, spacing: 6) {
                    TranslatableText(request.title, preserving: store.contentIdentifiers)
                    CommercialBadge(text: CommercialStrings.text(request.status.label, locale: locale), tone: .warning)
                }
            }
            ForEach(detail.tickets) { ticket in
                VStack(alignment: .leading, spacing: 6) {
                    TranslatableText(ticket.title, preserving: store.contentIdentifiers)
                    CommercialBadge(text: CommercialStrings.text(ticket.status.label, locale: locale), tone: .urgent)
                }
            }
            if detail.requests.isEmpty { VText("Aucune demande") }
            if detail.tickets.isEmpty { VText("Aucun ticket ouvert") }
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
    }
}

extension PhaseStatus {
    var label: String {
        switch self {
        case .upcoming: "À venir"
        case .active: "En cours"
        case .awaitingValidation: "En attente de validation"
        case .completed: "Terminée"
        }
    }
}
extension BillingStatus {
    var label: String {
        switch self {
        case .notInvoiced: "Non facturé"
        case .partial: "Facturation partielle"
        case .invoiced: "Facturé"
        }
    }
}
extension ChangeRequestStatus {
    var label: String {
        switch self {
        case .submitted: "Soumise"
        case .toEstimate: "À chiffrer"
        case .planned: "Planifiée"
        case .active: "En cours"
        case .delivered: "Livrée"
        case .validated: "Validée"
        case .refused: "Refusée"
        }
    }
}
extension TicketStatus {
    var label: String {
        switch self {
        case .open: "Ouvert"
        case .active: "En cours"
        case .resolved: "Résolu"
        case .closed: "Fermé"
        }
    }
}
#endif
