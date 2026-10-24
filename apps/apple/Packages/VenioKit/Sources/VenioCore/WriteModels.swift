import Foundation

public struct VenioAPIError: Error, Sendable, Equatable {
    public let code: String
    public init(code: String) { self.code = code }
}

public struct QuoteTemplate: Codable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var title: String
    public var intro: String
    public var lines: [QuoteLine]
    public var validityDays: Int

    public init(id: String, name: String, title: String, intro: String = "", lines: [QuoteLine], validityDays: Int = 30) {
        self.id = id
        self.name = name
        self.title = title
        self.intro = intro
        self.lines = lines
        self.validityDays = validityDays
    }
}

public struct InteractionDraft: Codable, Sendable, Equatable {
    public enum Kind: String, Codable, Sendable { case call = "CALL", note = "NOTE", meeting = "MEETING" }
    public var idempotencyKey: UUID
    public var subjectType: InteractionSubject
    public var subjectId: String
    public var kind: Kind
    public var body: String
    public var lang: String?
    public var direction: InteractionDirection
    public var occurredAt: Date
    public var subject: String?
    public var audioFileURL: URL?

    public init(idempotencyKey: UUID, subjectType: InteractionSubject, subjectId: String, kind: Kind, body: String,
                lang: String? = nil, direction: InteractionDirection, occurredAt: Date, subject: String? = nil, audioFileURL: URL? = nil) {
        self.idempotencyKey = idempotencyKey
        self.subjectType = subjectType
        self.subjectId = subjectId
        self.kind = kind
        self.body = body
        self.lang = lang
        self.direction = direction
        self.occurredAt = occurredAt
        self.subject = subject
        self.audioFileURL = audioFileURL
    }
}

public struct LeadPatch: Codable, Sendable {
    public enum FollowUp: Sendable { case set(Date), clear }
    public var status: LeadStage?
    public var nextActionAt: FollowUp?
    public var lostReason: String?

    public init(status: LeadStage? = nil, nextActionAt: FollowUp? = nil, lostReason: String? = nil) {
        self.status = status
        self.nextActionAt = nextActionAt
        self.lostReason = lostReason
    }

    private enum CodingKeys: String, CodingKey { case status, nextActionAt, lostReason }
    public init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        status = try values.decodeIfPresent(LeadStage.self, forKey: .status)
        lostReason = try values.decodeIfPresent(String.self, forKey: .lostReason)
        if values.contains(.nextActionAt) {
            nextActionAt = try values.decodeIfPresent(Date.self, forKey: .nextActionAt).map(FollowUp.set) ?? .clear
        }
    }
    public func encode(to encoder: any Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encodeIfPresent(status, forKey: .status)
        try values.encodeIfPresent(lostReason, forKey: .lostReason)
        switch nextActionAt {
        case .set(let date): try values.encode(date, forKey: .nextActionAt)
        case .clear: try values.encodeNil(forKey: .nextActionAt)
        case nil: break
        }
    }
}
