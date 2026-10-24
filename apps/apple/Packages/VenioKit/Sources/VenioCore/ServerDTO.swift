import Foundation

public enum ServerCoding {
    public static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            guard let date = date(text) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Invalid date")) }
            return date
        }
        return decoder
    }
    public static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
    static func date(_ text: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: text) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: text)
    }
    static func object(_ data: Data) throws -> [String: Any] {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw VenioAPIError(code: "INVALID_RESPONSE") }
        return object
    }
    static func reference(_ value: Any?) -> String? {
        if let text = value as? String { return text }
        let object = value as? [String: Any]
        return object?["_id"] as? String ?? object?["id"] as? String
    }
}

struct ServerReference: Decodable, Sendable {
    let id: String
    let name: String?
    let ownerAdminId: String?
    init(from decoder: any Decoder) throws {
        if let text = try? decoder.singleValueContainer().decode(String.self) { id = text; name = nil; ownerAdminId = nil; return }
        let values = try decoder.container(keyedBy: Keys.self)
        id = try values.decodeIfPresent(String.self, forKey: ._id) ?? values.decode(String.self, forKey: .id)
        name = try values.decodeIfPresent(String.self, forKey: .name)
        ownerAdminId = try values.decodeIfPresent(ServerReference.self, forKey: .ownerAdminId)?.id
    }
    enum Keys: String, CodingKey { case _id, id, name, ownerAdminId }
}

struct LeadDTO: Decodable, Sendable {
    var _id: String
    var company: String?
    var contactName: String?
    var contactEmail: String?
    var contactPhone: String?
    var source: String?
    var status: LeadStage?
    var priority: Priority?
    var budget: Decimal?
    var nextActionAt: Date?
    var serviceType: String?
    var leadTemperature: LeadTemperature?
    var assignedTo: ServerReference?
    var score: Int?
    var notes: String?
    var createdAt: Date?
    var updatedAt: Date?
    var statusChangedAt: Date?
    var lostReason: String?
    var clientAccountId: ServerReference?

    var model: Lead {
        Lead(id: _id, company: company ?? "", contactName: contactName ?? "", contactEmail: contactEmail ?? "",
             contactPhone: contactPhone ?? "", source: source ?? "", status: status ?? .lead, priority: priority ?? .normal,
             budget: budget, nextActionAt: nextActionAt, serviceType: serviceType ?? "", leadTemperature: leadTemperature ?? .warm,
             assignedTo: assignedTo?.id, score: score, notes: notes ?? "", createdAt: createdAt ?? .distantPast,
             updatedAt: updatedAt, statusChangedAt: statusChangedAt, lostReason: lostReason ?? "", clientAccountId: clientAccountId?.id)
    }
}

struct InteractionDTO: Decodable, Sendable {
    var _id: String?
    var id: String?
    var subjectType: InteractionSubject
    var subjectId: ServerReference
    var kind: InteractionKind
    var direction: InteractionDirection?
    var occurredAt: Date
    var subject: String?
    var label: String?
    var body: String?
    var author: ServerReference?

    var model: Interaction {
        Interaction(id: id ?? _id ?? "", subjectType: subjectType, subjectId: subjectId.id, kind: kind,
                    direction: direction ?? .none, occurredAt: occurredAt, subject: label ?? subject ?? "", body: body ?? "", author: author?.id)
    }
}

struct ProjectDTO: Decodable, Sendable {
    var _id: String
    var projectNumber: String?
    var name: String
    var client: ServerReference
    var assignedTo: ServerReference?
    var status: ProjectStatus?
    var budget: Budget?
    var billing: Billing?
    var endDate: Date?
    struct Budget: Decodable, Sendable { var amount: Decimal?; var currency: String? }
    struct Billing: Decodable, Sendable { var amountInvoiced: Decimal?; var billingStatus: BillingStatus? }
    var model: Project {
        Project(id: _id, projectNumber: projectNumber ?? "", name: name, client: client.id, status: status ?? .active,
                budget: ProjectBudget(amount: budget?.amount, currency: budget?.currency ?? "EUR"),
                billing: ProjectBilling(amountInvoiced: billing?.amountInvoiced, billingStatus: billing?.billingStatus ?? .notInvoiced),
                endDate: endDate, progress: 0, assignedTo: assignedTo?.id, ownerAdminId: client.ownerAdminId)
    }
}
struct PhaseDTO: Decodable, Sendable {
    var _id: String
    var project: ServerReference
    var title: String
    var order: Int?
    var status: PhaseStatus?
    var dueAt: Date?
    var model: ProjectPhase { ProjectPhase(id: _id, project: project.id, title: title, order: order ?? 0, status: status ?? .upcoming, dueAt: dueAt) }
}
struct UpdateDTO: Decodable, Sendable {
    var _id: String
    var project: ServerReference
    var title: String
    var description: String?
    var createdBy: ServerReference?
    var createdAt: Date
    var model: ProjectUpdate { ProjectUpdate(id: _id, project: project.id, title: title, description: description ?? "", author: createdBy?.name ?? "", createdAt: createdAt) }
}
struct QuoteLineDTO: Decodable, Sendable {
    var description: String
    var quantity: Decimal?
    var unitPrice: Decimal
    var taxRate: Decimal?
    var isOptional: Bool?
    var model: QuoteLine { QuoteLine(description: description, quantity: quantity ?? 1, unitPrice: unitPrice, taxRate: taxRate ?? 0, isOptional: isOptional ?? false) }
}
struct QuoteDTO: Decodable, Sendable {
    var _id: String
    var project: ServerReference
    var client: ServerReference
    var createdBy: ServerReference
    var title: String
    var status: QuoteStatus
    var lines: [QuoteLineDTO]?
    var signature: QuoteSignature?
    var firstViewedAt: Date?
    var expiresAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var model: QuoteProposal {
        QuoteProposal(id: _id, project: project.id, client: client.id, createdBy: createdBy.id, title: title, status: status,
                      lines: lines?.map(\.model) ?? [], signature: signature ?? QuoteSignature(signedAt: nil), firstViewedAt: firstViewedAt,
                      expiresAt: expiresAt, createdAt: createdAt, updatedAt: updatedAt)
    }
}
struct TemplateDTO: Decodable, Sendable {
    var _id: String
    var name: String
    var title: String
    var intro: String?
    var lines: [QuoteLineDTO]?
    var validityDays: Int?
    var model: QuoteTemplate { QuoteTemplate(id: _id, name: name, title: title, intro: intro ?? "", lines: lines?.map(\.model) ?? [], validityDays: validityDays ?? 30) }
}
struct ChangeRequestDTO: Decodable, Sendable {
    var _id: String
    var project: ServerReference?
    var title: String
    var status: ChangeRequestStatus
    var model: ChangeRequest { ChangeRequest(id: _id, project: project?.id, title: title, status: status) }
}
struct MeDTO: Decodable, Sendable {
    var user: MeUser
    struct MeUser: Decodable, Sendable {
        var _id: String
        var name: String
        var email: String
        var role: String
        var permissions: Set<String>?
        var model: MobileUser { MobileUser(id: _id, name: name, email: email, role: role, permissions: permissions ?? []) }
    }
}
struct TodayDTO: Decodable, Sendable {
    var meetings: Meetings
    struct Meetings: Decodable, Sendable { var items: [Event] }
    struct Event: Decodable, Sendable {
        var id: String
        var title: String
        var date: String
        var projectId: ServerReference?
        var projectName: String?
        func model(userID: String) throws -> Appointment {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(identifier: "Europe/Paris")
            formatter.dateFormat = "yyyy-MM-dd"
            guard let start = formatter.date(from: date) else { throw VenioAPIError(code: "INVALID_RESPONSE") }
            return Appointment(id: id, leadId: "", title: title, startsAt: start, assignedTo: userID, location: projectName ?? "")
        }
    }
}
