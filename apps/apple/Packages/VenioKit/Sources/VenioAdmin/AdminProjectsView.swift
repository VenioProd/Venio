#if !os(watchOS)
import SwiftUI
import VenioTheme

struct AdminProjectsView: View {
    @Environment(AdminStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.adminReadOnly) private var readOnly
    @Environment(\.venioPalette) private var palette
    @Binding var selection: String?
    @State private var delivered = false
    private var projects: [AdminProject] { store.projects.filter { ($0.status == .completed) == delivered } }
    var body: some View {
        AdminSectionContent(section: .projects) {
            VStack(spacing: 0) {
                Picker(AdminStrings.text("Projets", locale: locale), selection: $delivered) {
                    AdminText("En construction").tag(false)
                    AdminText("Livrés").tag(true)
                }.pickerStyle(.segmented).labelsHidden().padding()
                if projects.isEmpty { AdminEmptyView(title: "Aucun projet") }
                else {
                    List(projects) { project in
                        if readOnly {
                            NavigationLink(value: project.id) { row(project) }
                        } else {
                            Button { selection = project.id } label: { row(project) }.buttonStyle(.plain)
                                .listRowBackground(palette.accent.color.opacity(selection == project.id ? 0.12 : 0))
                                .accessibilityAddTraits(selection == project.id ? .isSelected : [])
                        }
                    }.scrollContentBackground(.hidden)
                }
            }
        }
        .onChange(of: projects.map(\.id), initial: true) { _, ids in
            if selection == nil { selection = ids.first }
        }
        .onChange(of: delivered) { _, _ in selection = projects.first?.id }
    }
    private func row(_ project: AdminProject) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(verbatim: project.clientName).font(.headline)
                Spacer()
                Text(verbatim: AdminFormats(locale: locale).percent(project.progress)).monospacedDigit()
            }
            Text(verbatim: project.name).font(.subheadline)
            ProgressView(value: Double(project.progress), total: 100)
            if let phase = project.currentPhase {
                Text(verbatim: AdminStrings.text(phase.title, locale: locale) + " · " + String(phase.rank) + "/" + String(phase.total)).font(.caption)
            }
            if let date = project.endDate {
                Text(verbatim: AdminStrings.format("Livraison %@", locale: locale, AdminFormats(locale: locale).date(date))).font(.caption)
            }
            Text(verbatim: AdminStrings.format("%lld demandes ouvertes", locale: locale, project.openChangeRequests)).font(.caption)
        }.padding(.vertical, 10).frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct AdminProjectView: View {
    @Environment(AdminStore.self) private var store
    @Environment(\.locale) private var locale
    @State private var tab = "Suivi"
    @State private var updateTitle = ""
    @State private var updateBody = ""
    let id: String
    private var tabs: [String] {
        var tabs = ["Suivi", "Demandes", "Documents"]
        if store.capabilities.canViewProjectFinance { tabs.append("Compta") }
        return tabs
    }
    var body: some View {
        Group {
            if let error = store.errors[.project(id)] {
                AdminFailureView(error: error) { await store.loadProject(id: id) }
            } else if let detail = store.projectDetails[id] {
                AdminPage {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(verbatim: detail.project.clientName).font(.largeTitle.bold())
                        Text(verbatim: detail.project.projectNumber + " · " + detail.project.name)
                        Picker(AdminStrings.text("Détail du projet", locale: locale), selection: $tab) {
                            ForEach(tabs, id: \.self) { AdminText($0).tag($0) }
                        }.pickerStyle(.segmented).labelsHidden()
                    }
                    switch tab {
                    case "Demandes": AdminRequestsView(projectID: id)
                    case "Documents": AdminDocumentsView(detail: detail)
                    case "Compta": AdminProjectFinanceView(id: id)
                    default: AdminProjectFollowView(detail: detail, updateTitle: $updateTitle, updateBody: $updateBody)
                    }
                }
            } else { ProgressView { AdminText("Chargement") } }
        }
        .background { ThemedBackground() }
        .task(id: id) { await store.loadProject(id: id) }
        .refreshable { await store.loadProject(id: id) }
    }
}
#endif
