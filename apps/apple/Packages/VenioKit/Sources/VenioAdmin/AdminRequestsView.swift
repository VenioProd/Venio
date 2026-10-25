#if !os(watchOS)
import SwiftUI
import VenioTheme

struct AdminRequestsView: View {
    @Environment(AdminStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.adminReadOnly) private var readOnly
    @State private var refusing: ChangeRequest?
    @State private var reason = ""
    let projectID: String
    private var requests: [ChangeRequest] { store.changeRequests.filter { $0.projectId == projectID } }
    var body: some View {
        Group {
            if let error = store.errors[.changeRequests] {
                AdminFailureView(error: error) { await store.loadChangeRequests() }
            } else if store.inFlight.contains(.changeRequests) { ProgressView() }
            else if !store.user.permissions.contains("view_change_requests") {
                AdminFailureView(error: .forbidden) {}
            } else if requests.isEmpty { AdminEmptyView(title: "Aucune demande") }
            else {
                ForEach(requests) { request in
                    VStack(alignment: .leading, spacing: 12) {
                        Text(verbatim: request.title).font(.headline)
                        Text(verbatim: request.description)
                        HStack { AdminBadge(title: request.status.title); AdminBadge(title: request.priority.title) }
                        if !readOnly && store.capabilities.canTriage {
                            ViewThatFits(in: .horizontal) {
                                HStack { actions(request) }
                                VStack(alignment: .leading) { actions(request) }
                            }.disabled(store.inFlight.contains(.triage(request.id)))
                            AdminActionError(operation: .triage(request.id))
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
                }
            }
        }
        .task {
            if store.user.permissions.contains("view_change_requests") { await store.loadChangeRequests() }
        }
        .sheet(item: $refusing) { request in
            NavigationStack {
                VStack(alignment: .leading, spacing: 16) {
                    Text(verbatim: request.title).font(.headline)
                    TextField(AdminStrings.text("Motif obligatoire", locale: locale), text: $reason, axis: .vertical)
                        .textFieldStyle(.roundedBorder).lineLimit(3...8)
                    Button(role: .destructive) {
                        Task {
                            await store.triage(changeRequestId: request.id, action: .refuse(reason: reason))
                            if store.errors[.triage(request.id)] == nil { refusing = nil }
                        }
                    } label: { AdminText("Refuser") }
                        .disabled(reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.inFlight.contains(.triage(request.id)))
                    AdminActionError(operation: .triage(request.id))
                }.padding().frame(minWidth: 300, minHeight: 240)
                    .navigationTitle(AdminStrings.text("Refuser la demande", locale: locale))
                    .toolbar { ToolbarItem(placement: .cancellationAction) {
                        Button { refusing = nil } label: { AdminText("Annuler") }
                    } }
            }
        }
    }
    @ViewBuilder private func actions(_ request: ChangeRequest) -> some View {
        switch request.status {
        case .submitted:
            actionButton("Planifier", request: request, action: .include)
            if store.capabilities.canQuote { actionButton("Chiffrer", request: request, action: .quote(projectId: projectID)) }
            refusal(request)
        case .toQuote: refusal(request)
        case .planned: actionButton("Démarrer", request: request, action: .start)
        case .inProgress: actionButton("Livrer", request: request, action: .deliver)
        default: EmptyView()
        }
    }
    private func refusal(_ request: ChangeRequest) -> some View {
        Button(role: .destructive) { reason = ""; refusing = request } label: { AdminText("Refuser") }
    }
    private func actionButton(_ title: String, request: ChangeRequest, action: TriageAction) -> some View {
        Button { Task { await store.triage(changeRequestId: request.id, action: action) } } label: { AdminText(title) }
    }
}
#endif
