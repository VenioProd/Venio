#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

struct QuickEntryButton: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    var body: some View {
        if store.canQuickEntry {
            Button { store.showingQuickEntry = true } label: {
                Image(systemName: "plus").font(.title3.weight(.semibold))
                    .frame(width: 40, height: 40)
                    .foregroundStyle(palette.accentText.color)
                    .background {
                        if palette.theme == .neon { Circle().fill(palette.surfaces[0].color) }
                    }
                    .glassEffect(palette.theme == .glass ? .regular.interactive() : .identity, in: Circle())
                    .overlay {
                        if palette.theme == .neon { Circle().strokeBorder(palette.accent.color.opacity(0.5), lineWidth: 1) }
                    }
            }.buttonStyle(.plain)
                .accessibilityLabel(CommercialStrings.text("Ajouter", locale: locale))
                .accessibilityIdentifier("quickEntry.open")
        }
    }
}

private struct QuickEntryPlacement: ViewModifier {
    @Environment(CommercialStore.self) private var store
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
    #endif
    let inHeader: Bool
    private var compact: Bool {
        #if os(iOS)
        sizeClass != .regular
        #else
        false
        #endif
    }
    func body(content: Content) -> some View {
        content
            .toolbar {
                if !compact && !inHeader {
                    ToolbarItem(placement: .primaryAction) { QuickEntryButton() }
                }
            }
    }
}

/// Sur iPhone, le « + » vit dans l'en-tête de chaque page : rien ne flotte au-dessus du contenu.
struct CompactQuickEntryButton: View {
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
    #endif
    var body: some View {
        #if os(iOS)
        if sizeClass != .regular { QuickEntryButton() }
        #endif
    }
}

extension View {
    func commercialQuickEntry(inHeader: Bool = false) -> some View { modifier(QuickEntryPlacement(inHeader: inHeader)) }
}

struct QuickEntryView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.dismiss) private var dismiss
    @Environment(\.venioPalette) private var palette
    @State private var step = Step.choices
    @State private var voiceLead: Lead?
    private enum Step { case choices, manual, card, voice, document }
    let onCreated: (String) -> Void
    private var choosing: Bool { step == .choices }
    var body: some View {
        Group {
            switch step {
            case .choices: choices
            case .manual: NewLeadView(initialTab: "Saisie", onCreated: onCreated)
            case .card: NewLeadView(initialTab: "Carte", onCreated: onCreated)
            case .voice:
                if let voiceLead { VoiceNoteView(lead: voiceLead) }
                else { QuickEntryLeadPicker { voiceLead = $0 } }
            case .document: QuickEntryProjectPicker()
            }
        }
        #if os(iOS)
        .presentationDetents(choosing ? [.medium, .large] : [.large])
        .presentationDragIndicator(.visible)
        #else
        .frame(minWidth: 480, minHeight: 440)
        #endif
    }
    private var choices: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    if store.currentUser?.permissions.contains("manage_crm") == true {
                        choice("Nouveau lead", detail: "Saisir un contact et son besoin", icon: "person.badge.plus", step: .manual)
                            .accessibilityIdentifier("quickEntry.newLead")
                        Divider()
                        choice("Scanner une carte de visite", detail: "Remplir un lead depuis une photo", icon: "person.crop.rectangle", step: .card)
                        Divider()
                        choice("Note vocale", detail: "Dicter une note sur un lead", icon: "mic", step: .voice)
                        if store.canManageDocuments { Divider() }
                    }
                    if store.canManageDocuments {
                        choice("Ajouter un document", detail: "Scanner, photographier ou importer", icon: "doc.badge.plus", step: .document)
                    }
                }.padding(.horizontal, 24)
            }
            .navigationTitle(CommercialStrings.text("Ajouter", locale: locale))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { VText("Fermer") } } }
        }
    }
    private func choice(_ title: String, detail: String, icon: String, step: Step) -> some View {
        Button { self.step = step } label: {
            HStack(spacing: 16) {
                Image(systemName: icon).font(.title3).foregroundStyle(palette.accentText.color).frame(width: 32)
                VStack(alignment: .leading, spacing: 4) {
                    VText(title).font(.headline)
                    VText(detail).font(.subheadline).foregroundStyle(palette.textSecondary.color)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(palette.textSecondary.color)
            }.padding(.vertical, 16).contentShape(Rectangle())
        }.buttonStyle(.plain)
    }
}

private struct QuickEntryLeadPicker: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    let onLead: (Lead) -> Void
    private var leads: [Lead] {
        store.leads.filter {
            store.currentUser?.permissions.contains("manage_crm") == true && $0.assignedTo == store.currentUser?.id
                && (query.isEmpty || $0.company.localizedStandardContains(query) || $0.contactName.localizedStandardContains(query))
        }.sorted { $0.updatedAt == $1.updatedAt ? $0.id < $1.id : $0.updatedAt > $1.updatedAt }
    }
    var body: some View {
        NavigationStack {
            List(leads) { lead in
                Button { onLead(lead) } label: { LeadRow(lead: lead) }.buttonStyle(.plain)
            }
            .overlay { if leads.isEmpty { ContentUnavailableView.search(text: query) } }
            .searchable(text: $query, prompt: CommercialStrings.text("Société, contact", locale: locale))
            .navigationTitle(CommercialStrings.text("Choisir un lead", locale: locale))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { VText("Fermer") } } }
        }
    }
}

private struct QuickEntryProjectPicker: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    private var projects: [Project] {
        store.projects.filter {
            store.canManageDocuments && (query.isEmpty || $0.clientName.localizedStandardContains(query)
                || $0.name.localizedStandardContains(query) || $0.projectNumber.localizedStandardContains(query))
        }.sorted {
            let first = latestActivity($0), second = latestActivity($1)
            return first == second ? $0.projectNumber > $1.projectNumber : first > second
        }
    }
    private func latestActivity(_ project: Project) -> Date {
        let update = store.projectDetails[project.id]?.updates.map(\.createdAt).max() ?? .distantPast
        let document = store.projectDocuments[project.id]?.map(\.uploadedAt).max() ?? .distantPast
        return max(update, document)
    }
    var body: some View {
        NavigationStack {
            List(projects) { project in
                NavigationLink(value: project.id) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(verbatim: project.clientName).font(.headline)
                        Text(verbatim: project.name + " · " + project.projectNumber).font(.caption)
                    }.padding(.vertical, 8)
                }
            }
            .overlay { if projects.isEmpty { ContentUnavailableView.search(text: query) } }
            .searchable(text: $query, prompt: CommercialStrings.text("Rechercher un projet", locale: locale))
            .navigationTitle(CommercialStrings.text("Choisir un projet", locale: locale))
            .navigationDestination(for: String.self) { id in QuickEntryDocumentSources(projectId: id) }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { VText("Fermer") } } }
        }
    }
}

private struct QuickEntryDocumentSources: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @State private var acquisition = DocumentAcquisition()
    let projectId: String
    var body: some View {
        List {
            if let project = store.projects.first(where: { $0.id == projectId }) {
                Section {
                    DocumentSourceActions(acquisition: acquisition, projectId: projectId)
                        .disabled(!store.canManageDocuments)
                } header: { Text(verbatim: project.clientName + " · " + project.name) }
            }
        }
        .navigationTitle(CommercialStrings.text("Ajouter un document", locale: locale))
        .documentAcquisition(acquisition)
    }
}
#endif
