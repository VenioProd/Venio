import Foundation

/// Un élément mal formé est écarté au lieu de faire échouer toute la liste.
@propertyWrapper struct Lossy<Element: Decodable & Sendable>: Decodable, Sendable {
    var wrappedValue: [Element]
    init(from decoder: any Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var values: [Element] = []
        while !container.isAtEnd {
            if let value = try? container.decode(Element.self) { values.append(value) }
            else { _ = try container.decode(Skipped.self) }
        }
        wrappedValue = values
    }
    private struct Skipped: Decodable {}
}

struct AdminReference: Decodable, Sendable {
    var id: String
    var name: String?
    var companyName: String?
    var title: String?
    init(from decoder: any Decoder) throws {
        if let id = try? decoder.singleValueContainer().decode(String.self) {
            self.id = id
            return
        }
        let values = try decoder.container(keyedBy: Keys.self)
        id = try values.decode(String.self, forKey: ._id)
        name = try values.decodeIfPresent(String.self, forKey: .name)
        companyName = try values.decodeIfPresent(String.self, forKey: .companyName)
        title = try values.decodeIfPresent(String.self, forKey: .title)
    }
    enum Keys: String, CodingKey { case _id, name, companyName, title }
    var displayName: String { companyName.flatMap { $0.isEmpty ? nil : $0 } ?? name ?? "" }
}

struct AdminProjectDTO: Decodable, Sendable {
    var _id: String
    var projectNumber: String?
    var name: String
    var client: AdminReference?
    var status: AdminProjectStatus
    var endDate: Date?
    var budget: Budget?
    var billing: Billing?
    var isArchived: Bool?
    struct Budget: Decodable, Sendable { var amount: Decimal?; var currency: String? }
    struct Billing: Decodable, Sendable { var amountInvoiced: Decimal? }

    func model(phases: [AdminPhase], requests: [ChangeRequest]) -> AdminProject {
        let sorted = phases.sorted { $0.order < $1.order }
        let currentIndex = sorted.firstIndex { $0.status == .inProgress || $0.status == .awaitingValidation }
        let current = currentIndex.map { CurrentPhase(title: sorted[$0].title, rank: $0 + 1, total: sorted.count) }
        return AdminProject(id: _id, projectNumber: projectNumber ?? "", name: name, clientName: client?.displayName ?? "",
            status: status, endDate: endDate,
            progress: sorted.isEmpty ? 0 : sorted.filter { $0.status == .completed }.count * 100 / sorted.count,
            budgetCents: cents(budget?.amount), invoicedCents: cents(billing?.amountInvoiced),
            currency: budget?.currency.flatMap { $0.isEmpty ? nil : $0.uppercased() } ?? "EUR", currentPhase: current,
            openChangeRequests: requests.filter { $0.projectId == _id && $0.status.isOpen }.count)
    }
    private func cents(_ amount: Decimal?) -> Int? {
        guard let amount else { return nil }
        var value = amount * 100
        var rounded = Decimal()
        NSDecimalRound(&rounded, &value, 0, .plain)
        return NSDecimalNumber(decimal: rounded).intValue
    }
}

extension AdminChangeRequestStatus {
    var isOpen: Bool {
        switch self {
        case .submitted, .toQuote, .planned, .inProgress, .delivered: true
        case .validated, .refused, .unknown: false
        }
    }
}

struct AdminPhaseDTO: Decodable, Sendable {
    var _id: String
    var title: String
    var order: Int
    var status: AdminPhaseStatus
    var requiresClientValidation: Bool
    var dueAt: Date?
    var model: AdminPhase {
        AdminPhase(id: _id, title: title, order: order, status: status,
                   requiresClientValidation: requiresClientValidation, dueAt: dueAt)
    }
}
struct ClientUpdateDTO: Decodable, Sendable {
    var _id: String
    var title: String
    var description: String?
    var createdAt: Date
    var model: ClientUpdate { ClientUpdate(id: _id, title: title, body: description ?? "", createdAt: createdAt) }
}
struct ProjectItemDTO: Decodable, Sendable {
    var _id: String
    var title: String
    var type: ProjectItemType
    var section: AdminReference?
    var status: ProjectItemStatus
    var isVisible: Bool
    var isDownloadable: Bool
    var model: ProjectItem {
        ProjectItem(id: _id, title: title, type: type, section: section?.title, status: status,
                    isVisible: isVisible, isDownloadable: isDownloadable)
    }
}
struct ProjectDocumentDTO: Decodable, Sendable {
    var _id: String
    var type: ProjectDocumentType
    var originalName: String
    var uploadedAt: Date
    var model: ProjectDocument { ProjectDocument(id: _id, type: type, originalName: originalName, uploadedAt: uploadedAt) }
}
struct AdminChangeRequestDTO: Decodable, Sendable {
    var _id: String
    var title: String
    var description: String?
    var client: AdminReference?
    var project: AdminReference?
    var priority: AdminPriority
    var status: AdminChangeRequestStatus
    var createdAt: Date
    func model(previous: ChangeRequest? = nil) -> ChangeRequest {
        let clientName = client?.displayName ?? ""
        return ChangeRequest(id: _id, title: title, description: description ?? "",
            clientName: clientName.isEmpty ? previous?.clientName ?? "" : clientName,
            projectId: project?.id, projectName: project?.name ?? (previous?.projectId == project?.id ? previous?.projectName : nil),
            priority: priority, status: status, createdAt: createdAt)
    }
}
struct ConversationDTO: Decodable, Sendable {
    var _id: String
    var type: ConversationKind
    var name: String?
    var unreadCount: Int
    var lastMessage: MessageDTO?
    var lastMessageAt: Date?
    var model: Conversation {
        Conversation(id: _id, kind: type, title: name ?? "", unreadCount: unreadCount,
                     lastMessagePreview: lastMessage?.content, lastMessageAt: lastMessageAt)
    }
}
struct MessageDTO: Decodable, Sendable {
    var _id: String
    var sender: AdminReference?
    var content: String
    var createdAt: Date
    var deletedAt: Date?
    var model: Message {
        Message(id: _id, senderName: sender?.name ?? "", senderId: sender?.id ?? "", content: content,
                createdAt: createdAt, isDeleted: deletedAt != nil)
    }
}
struct ActivitySectionDTO: Decodable, Sendable {
    var key: String
    var label: String
    @Lossy var entries: [Entry]
    var hasMore: Bool
    struct Entry: Decodable, Sendable {
        var id: String
        var title: String
        var meta: String
        var dueAt: Date?
        enum Keys: String, CodingKey { case id, title, meta, dueAt }
        init(from decoder: any Decoder) throws {
            let values = try decoder.container(keyedBy: Keys.self)
            id = try values.decode(String.self, forKey: .id)
            title = try values.decode(String.self, forKey: .title)
            meta = try values.decode(String.self, forKey: .meta)
            // Le serveur renvoie "" quand il n'y a pas d'échéance.
            dueAt = try? values.decodeIfPresent(Date.self, forKey: .dueAt)
        }
    }
    var model: ActivitySection {
        ActivitySection(key: key, title: label, entries: entries.map {
            ActivityEntry(id: $0.id, title: $0.title, meta: $0.meta, dueAt: $0.dueAt)
        }, hasMore: hasMore)
    }
}
struct AdminTicketDTO: Decodable, Sendable {
    var _id: String
    var title: String
    var message: String
    var category: TicketCategory
    var priority: AdminPriority
    var status: AdminTicketStatus
    var authorName: String
    var project: AdminReference?
    var createdAt: Date
    var replies: [Reply]
    struct Reply: Decodable, Sendable {
        var authorId: String
        var authorName: String
        var message: String
        var createdAt: Date
        var model: TicketReply { TicketReply(authorId: authorId, authorName: authorName, message: message, createdAt: createdAt) }
    }
    var model: Ticket {
        Ticket(id: _id, title: title, message: message, category: category, priority: priority, status: status,
               authorName: authorName, projectName: project?.name, createdAt: createdAt, replies: replies.map(\.model))
    }
}

struct ProjectsResponse: Decodable, Sendable { @Lossy var projects: [AdminProjectDTO] }
struct ProjectResponse: Decodable, Sendable { var project: AdminProjectDTO }
struct PhasesResponse: Decodable, Sendable { @Lossy var phases: [AdminPhaseDTO] }
struct PhaseResponse: Decodable, Sendable { var phase: AdminPhaseDTO }
struct UpdatesResponse: Decodable, Sendable { @Lossy var updates: [ClientUpdateDTO] }
struct UpdateResponse: Decodable, Sendable { var update: ClientUpdateDTO }
struct ItemsResponse: Decodable, Sendable { @Lossy var items: [ProjectItemDTO] }
struct ItemResponse: Decodable, Sendable { var item: ProjectItemDTO }
struct DocumentsResponse: Decodable, Sendable { @Lossy var documents: [ProjectDocumentDTO] }
struct RequestsResponse: Decodable, Sendable { @Lossy var changeRequests: [AdminChangeRequestDTO] }
struct RequestResponse: Decodable, Sendable { var changeRequest: AdminChangeRequestDTO }
struct ConversationsResponse: Decodable, Sendable { @Lossy var conversations: [ConversationDTO] }
struct MessagesResponse: Decodable, Sendable { @Lossy var messages: [MessageDTO] }
struct MessageResponse: Decodable, Sendable { var message: MessageDTO }
struct ActivityResponse: Decodable, Sendable { @Lossy var sections: [ActivitySectionDTO] }
