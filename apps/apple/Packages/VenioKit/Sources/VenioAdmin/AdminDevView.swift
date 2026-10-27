#if !os(watchOS)
import SwiftUI
import VenioTheme

struct AdminDevView: View {
    @Environment(AdminStore.self) private var store
    @Environment(\.adminReadOnly) private var readOnly
    @Environment(\.venioPalette) private var palette
    @Binding var selection: String?
    private let statuses: [DevIssueStatus] = [.inProgress, .inReview, .blocked, .todo, .backlog, .done, .cancelled, .duplicate, .unknown]
    var body: some View {
        AdminSectionContent(section: .dev) {
            if store.devIssues.isEmpty { AdminEmptyView(title: "Aucune issue") }
            else {
                List {
                    ForEach(statuses, id: \.self) { status in
                        let issues = store.devIssues.filter { $0.status == status }
                        if !issues.isEmpty {
                            Section { ForEach(issues) { issue in
                                if readOnly { NavigationLink(value: issue.id) { row(issue) } }
                                else {
                                    Button { selection = issue.id } label: { row(issue) }.buttonStyle(.plain)
                                        .listRowBackground(palette.accent.color.opacity(selection == issue.id ? 0.12 : 0))
                                .accessibilityAddTraits(selection == issue.id ? .isSelected : [])
                                }
                            } } header: { AdminText(status.title) }
                        }
                    }
                }.scrollContentBackground(.hidden)
            }
        }
    }
    private func row(_ issue: DevIssue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(verbatim: issue.identifier).font(.caption.monospaced())
            Text(verbatim: issue.title).font(.headline)
            Text(verbatim: issue.projectName).font(.caption)
            if let assignee = issue.assigneeName { Text(verbatim: assignee).font(.caption) }
            AdminBadge(title: issue.priority.title)
        }.padding(.vertical, 8)
    }
}

struct AdminDevDetailView: View {
    @Environment(AdminStore.self) private var store
    @Environment(\.adminReadOnly) private var readOnly
    let id: String
    var body: some View {
        Group {
            if let issue = store.devIssues.first(where: { $0.id == id }) {
                AdminPage {
                    Text(verbatim: issue.identifier).font(.headline.monospaced())
                    Text(verbatim: issue.title).font(.largeTitle.bold())
                    HStack { AdminBadge(title: issue.status.title); AdminBadge(title: issue.priority.title) }
                    Text(verbatim: issue.projectName)
                    if let assignee = issue.assigneeName { Text(verbatim: assignee) }
                    if !readOnly && store.capabilities.canManageDev {
                        Menu {
                            ForEach(DevIssueStatus.allCases.filter { $0 != .unknown && $0 != issue.status }, id: \.self) { status in
                                Button { Task { await store.setDevIssueStatus(id: id, status: status) } } label: { AdminText(status.title) }
                            }
                        } label: { AdminText("Changer le statut") }
                            .disabled(store.inFlight.contains(.devIssue(id)))
                        AdminActionError(operation: .devIssue(id))
                    }
                }
            } else { AdminEmptyView(title: "Issue indisponible") }
        }.background { ThemedBackground() }
    }
}
#endif
