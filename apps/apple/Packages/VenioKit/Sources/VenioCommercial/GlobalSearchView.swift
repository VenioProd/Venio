#if !os(watchOS)
import SwiftUI
import QuickLook
import VenioCore

struct GlobalSearchView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var previewURL: URL?
    @State private var errorKey: String?
    let onOpen: (DeepLink) -> Void
    private var term: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var leads: [Lead] { store.leads.filter { matches([$0.company, $0.contactName]) } }
    private var projects: [Project] { store.projects.filter { matches([$0.clientName, $0.name, $0.projectNumber]) } }
    private var documents: [ProjectDocument] {
        store.projectDocuments.values.flatMap { $0 }.filter { matches([$0.title, CommercialStrings.text($0.title, locale: locale)]) }.sorted { $0.uploadedAt > $1.uploadedAt }
    }
    var body: some View {
        NavigationStack {
            List {
                if !term.isEmpty {
                    if !leads.isEmpty {
                        Section {
                            ForEach(leads) { lead in
                                Button { onOpen(.lead(lead.id)) } label: {
                                    Label {
                                        VStack(alignment: .leading) {
                                            Text(verbatim: lead.company)
                                            Text(verbatim: lead.contactName).font(.caption)
                                        }
                                    } icon: { Image(systemName: "person.crop.circle") }
                                }.buttonStyle(.plain)
                            }
                        } header: { VText("Leads") }
                    }
                    if !projects.isEmpty {
                        Section {
                            ForEach(projects) { project in
                                Button { onOpen(.project(project.id)) } label: {
                                    Label {
                                        VStack(alignment: .leading) {
                                            Text(verbatim: project.clientName + " · " + project.name)
                                            Text(verbatim: project.projectNumber).font(.caption)
                                        }
                                    } icon: { Image(systemName: "folder") }
                                }.buttonStyle(.plain)
                            }
                        } header: { VText("Projets") }
                    }
                    if !documents.isEmpty {
                        Section {
                            ForEach(documents) { document in
                                Button {
                                    Task {
                                        do { previewURL = try await store.documentFile(document) }
                                        catch { errorKey = mobileErrorKey(error) }
                                    }
                                } label: {
                                    Label {
                                        VStack(alignment: .leading) {
                                            Text(verbatim: CommercialStrings.text(document.title, locale: locale))
                                            if let project = store.projects.first(where: { $0.id == document.project }) {
                                                Text(verbatim: project.clientName + " · " + project.projectNumber).font(.caption)
                                            }
                                        }
                                    } icon: { Image(systemName: "doc.text") }
                                }.buttonStyle(.plain)
                            }
                        } header: { VText("Documents") }
                    }
                }
            }
            .overlay {
                if term.isEmpty {
                    ContentUnavailableView(CommercialStrings.text("Rechercher dans Venio", locale: locale), systemImage: "magnifyingglass", description: Text(verbatim: CommercialStrings.text("Leads, projets et documents", locale: locale)))
                } else if leads.isEmpty && projects.isEmpty && documents.isEmpty {
                    ContentUnavailableView.search(text: query)
                }
            }
            .searchable(text: $query, prompt: CommercialStrings.text("Société, contact, projet, document", locale: locale))
            .navigationTitle(CommercialStrings.text("Recherche", locale: locale))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { VText("Fermer") } } }
        }
        .quickLookPreview($previewURL)
        .alert(CommercialStrings.text("Opération impossible. Réessayez.", locale: locale), isPresented: Binding(get: { errorKey != nil }, set: { if !$0 { errorKey = nil } })) {
            Button { errorKey = nil } label: { VText("Fermer") }
        } message: { if let errorKey { VText(errorKey) } }
        .frame(minWidth: 320, minHeight: 400)
    }
    private func matches(_ values: [String]) -> Bool {
        !term.isEmpty && values.contains { $0.localizedStandardContains(term) }
    }
}
#endif
