#if !os(watchOS)
import SwiftUI
import VenioTheme

struct AdminConversationsView: View {
    @Environment(AdminStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.adminReadOnly) private var readOnly
    @Environment(\.venioPalette) private var palette
    @Binding var selection: String?
    var body: some View {
        AdminSectionContent(section: .messaging) {
            if store.conversations.isEmpty { AdminEmptyView(title: "Aucune conversation") }
            else {
                List(store.conversations) { conversation in
                    if readOnly { NavigationLink(value: conversation.id) { row(conversation) } }
                    else {
                        Button { selection = conversation.id } label: { row(conversation) }.buttonStyle(.plain)
                            .listRowBackground(palette.accent.color.opacity(selection == conversation.id ? 0.12 : 0))
                                .accessibilityAddTraits(selection == conversation.id ? .isSelected : [])
                    }
                }.scrollContentBackground(.hidden)
            }
        }
    }
    private func row(_ conversation: Conversation) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(verbatim: conversation.title).font(.headline)
                Spacer()
                if conversation.unreadCount > 0 { Text(conversation.unreadCount, format: .number).font(.caption.bold()) }
            }
            Text(verbatim: conversation.lastMessagePreview ?? "").font(.subheadline).lineLimit(2)
            if let date = conversation.lastMessageAt {
                Text(verbatim: AdminFormats(locale: locale).date(date, template: "dMMMHHmm")).font(.caption)
            }
        }.padding(.vertical, 8)
    }
}

struct AdminMessagesView: View {
    @Environment(AdminStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    @Environment(\.adminReadOnly) private var readOnly
    @State private var text = ""
    let id: String
    var body: some View {
        VStack(spacing: 0) {
            if let error = store.errors[.messages(id)] {
                AdminFailureView(error: error) { await load() }
            } else if let messages = store.messages[id] {
                if messages.isEmpty { AdminEmptyView(title: "Aucun message") }
                else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 16) {
                                ForEach(messages) { message in bubble(message).id(message.id) }
                            }.padding()
                        }
                        .onChange(of: messages.last?.id, initial: true) { _, value in
                            if let value { proxy.scrollTo(value, anchor: .bottom) }
                        }
                    }
                }
            } else { ProgressView { AdminText("Chargement") }.frame(maxHeight: .infinity) }
            AdminActionError(operation: .markRead(id)).padding(.horizontal)
            if !readOnly && store.capabilities.canSendMessages {
                VStack(alignment: .leading, spacing: 10) {
                    TextField(AdminStrings.text("Votre message", locale: locale), text: $text, axis: .vertical)
                        .textFieldStyle(.roundedBorder).lineLimit(1...6)
                        .disabled(store.inFlight.contains(.sendMessage(id)))
                    Button { send() } label: {
                        Label { AdminText("Envoyer") } icon: { Image(systemName: "paperplane").accessibilityHidden(true) }
                    }.keyboardShortcut(.return, modifiers: .command)
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || text.count > 4000 || store.inFlight.contains(.sendMessage(id)))
                    AdminActionError(operation: .sendMessage(id))
                }.padding().venioCard().padding()
            }
        }
        .background { ThemedBackground() }
        .navigationTitle(store.conversations.first { $0.id == id }?.title ?? AdminStrings.text("Messagerie", locale: locale))
        .task(id: id) { await load() }
        .refreshable { await load() }
    }
    private func bubble(_ message: Message) -> some View {
        let own = message.senderId == store.user.id
        return HStack {
            if own { Spacer(minLength: 24) }
            VStack(alignment: .leading, spacing: 8) {
                Text(verbatim: message.senderName).font(.caption.bold())
                if message.isDeleted { AdminText("Message supprimé").italic() }
                else { Text(verbatim: message.content).textSelection(.enabled) }
                Text(verbatim: AdminFormats(locale: locale).date(message.createdAt, template: "dMMMHHmm")).font(.caption)
            }.padding().background(bubbleColor(own: own), in: RoundedRectangle(cornerRadius: 18))
            if !own { Spacer(minLength: 24) }
        }.accessibilityElement(children: .combine)
    }
    // Le thème glass n'a pas de surfaces : les bulles reprennent alors la couleur de base.
    private func bubbleColor(own: Bool) -> Color {
        if own { return palette.accent.color.opacity(0.14) }
        return (palette.surfaces.first ?? palette.base).color.opacity(0.7)
    }
    private func load() async {
        await store.loadMessages(conversationId: id)
        if store.errors[.messages(id)] == nil { await store.markRead(conversationId: id) }
    }
    private func send() {
        let content = text
        Task {
            await store.sendMessage(conversationId: id, content: content)
            if store.errors[.sendMessage(id)] == nil { text = "" }
        }
    }
}
#endif
