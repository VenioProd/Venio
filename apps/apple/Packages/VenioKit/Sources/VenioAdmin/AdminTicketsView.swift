#if !os(watchOS)
import SwiftUI
import VenioTheme

struct AdminTicketsView: View {
    @Environment(AdminStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.adminReadOnly) private var readOnly
    @Environment(\.venioPalette) private var palette
    @Binding var selection: String?
    @State private var status: AdminTicketStatus? = .open
    private var tickets: [Ticket] { store.tickets.filter { status == nil || $0.status == status } }
    var body: some View {
        AdminSectionContent(section: .tickets) {
            VStack {
                Picker(AdminStrings.text("Statut", locale: locale), selection: $status) {
                    ForEach(AdminTicketStatus.allCases.filter { $0 != .unknown }, id: \.self) { value in
                        AdminText(value.title).tag(Optional(value))
                    }
                    AdminText("Tous").tag(Optional<AdminTicketStatus>.none)
                }.labelsHidden().padding()
                if tickets.isEmpty { AdminEmptyView(title: "Aucun ticket") }
                else {
                    List(tickets) { ticket in
                        if readOnly { NavigationLink(value: ticket.id) { row(ticket) } }
                        else {
                            Button { selection = ticket.id } label: { row(ticket) }.buttonStyle(.plain)
                                .listRowBackground(palette.accent.color.opacity(selection == ticket.id ? 0.12 : 0))
                                .accessibilityAddTraits(selection == ticket.id ? .isSelected : [])
                        }
                    }.scrollContentBackground(.hidden)
                }
            }
        }
    }
    private func row(_ ticket: Ticket) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(verbatim: ticket.title).font(.headline)
            Text(verbatim: ticket.authorName).font(.subheadline)
            HStack { AdminBadge(title: ticket.status.title); AdminBadge(title: ticket.priority.title) }
        }.padding(.vertical, 8)
    }
}

struct AdminTicketView: View {
    @Environment(AdminStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.adminReadOnly) private var readOnly
    @State private var reply = ""
    let id: String
    var body: some View {
        Group {
            if let ticket = store.tickets.first(where: { $0.id == id }) {
                AdminPage {
                    Text(verbatim: ticket.title).font(.largeTitle.bold())
                    HStack { AdminBadge(title: ticket.status.title); AdminBadge(title: ticket.priority.title) }
                    if let project = ticket.projectName { Text(verbatim: project).font(.subheadline) }
                    message(ticket.message, author: ticket.authorName, date: ticket.createdAt)
                    ForEach(Array(ticket.replies.enumerated()), id: \.offset) { _, response in
                        message(response.message, author: response.authorName, date: response.createdAt)
                    }
                    if !readOnly && store.capabilities.canManageTickets {
                        VStack(alignment: .leading, spacing: 16) {
                            Menu {
                                ForEach(AdminTicketStatus.allCases.filter { $0 != .unknown && $0 != ticket.status }, id: \.self) { status in
                                    Button { Task { await store.setTicketStatus(id: id, status: status) } } label: { AdminText(status.title) }
                                }
                            } label: { AdminText("Changer le statut") }
                            TextField(AdminStrings.text("Votre réponse", locale: locale), text: $reply, axis: .vertical)
                                .textFieldStyle(.roundedBorder).lineLimit(3...8)
                            Button { send() } label: { AdminText("Répondre") }.buttonStyle(.borderedProminent)
                                .disabled(reply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            AdminActionError(operation: .ticket(id))
                        }.disabled(store.inFlight.contains(.ticket(id))).venioCard()
                    }
                }
            } else { AdminEmptyView(title: "Ticket indisponible") }
        }.background { ThemedBackground() }
    }
    private func message(_ text: String, author: String, date: Date) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(verbatim: author).font(.headline)
            Text(verbatim: text)
            Text(verbatim: AdminFormats(locale: locale).date(date, template: "dMMMHHmm")).font(.caption)
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
    }
    private func send() {
        let message = reply
        Task {
            await store.replyTicket(id: id, message: message)
            if store.errors[.ticket(id)] == nil { reply = "" }
        }
    }
}
#endif
