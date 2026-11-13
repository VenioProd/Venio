import Foundation

// Poste d'appel (lot N) : les routes du navigateur, sous `/api/admin/call-desk` pour l'équipe.
// L'app n'envoie jamais de numéro : elle lance un appel par l'identifiant du lead, le serveur compose.

public struct CallRecordingConfig: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var notice: Bool
    public init(enabled: Bool, notice: Bool) { self.enabled = enabled; self.notice = notice }
}

public struct CallConfig: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var edge: String?
    public var recording: CallRecordingConfig?
    public init(enabled: Bool, edge: String? = nil, recording: CallRecordingConfig? = nil) {
        self.enabled = enabled; self.edge = edge; self.recording = recording
    }
}

public struct VoiceToken: Codable, Sendable, Equatable {
    public var token: String
    public var identity: String
    public init(token: String, identity: String) { self.token = token; self.identity = identity }
}

public struct CallOutcome: Codable, Sendable, Equatable, Identifiable {
    public var value: String
    public var fr: String
    public var en: String
    /// `NONE`, `VOICEMAIL`, `CALLBACK` (date de rappel exigée), `MEETING`, `LOST`, `WRONG_NUMBER`, `DO_NOT_CALL`.
    public var effect: String
    public var id: String { value }
    public init(value: String, fr: String, en: String, effect: String) {
        self.value = value; self.fr = fr; self.en = en; self.effect = effect
    }
    public func label(language: String) -> String { language == "fr" ? fr : en }
}

public struct CallDeskSettings: Codable, Sendable, Equatable {
    public var outcomes: [CallOutcome]
    public var scriptTags: [String]
    public init(outcomes: [CallOutcome], scriptTags: [String]) { self.outcomes = outcomes; self.scriptTags = scriptTags }
}

public struct CallRecordingState: Codable, Sendable, Equatable {
    /// `NONE`, `RECORDING`, `STOPPED`, `READY`, `DELETED`.
    public var status: String
    public var objection: Bool
    public init(status: String, objection: Bool) { self.status = status; self.objection = objection }
}

public struct CallRecord: Codable, Sendable, Equatable {
    public static let finalStatuses: Set<String> = ["COMPLETED", "NO_ANSWER", "BUSY", "FAILED", "CANCELED"]
    public var id: String
    public var status: String
    public var answeredAt: Date?
    public var durationSec: Int?
    public var suggestedOutcome: String?
    public var recording: CallRecordingState?
    public var isFinal: Bool { Self.finalStatuses.contains(status) }
    enum CodingKeys: String, CodingKey { case id = "_id", status, answeredAt, durationSec, suggestedOutcome, recording }
    public init(id: String, status: String, answeredAt: Date? = nil, durationSec: Int? = nil, suggestedOutcome: String? = nil, recording: CallRecordingState? = nil) {
        self.id = id; self.status = status; self.answeredAt = answeredAt; self.durationSec = durationSec
        self.suggestedOutcome = suggestedOutcome; self.recording = recording
    }
}

/// Un appel de la fiche, avec l'état de son transcript et de son analyse (`nil` : pas encore créé).
public struct LeadCall: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var status: String
    public var startedAt: Date?
    public var answeredAt: Date?
    public var durationSec: Int?
    public var recording: CallRecordingState?
    public var transcriptStatus: String?
    public var analysisStatus: String?
    public var own: Bool?
    enum CodingKeys: String, CodingKey { case id = "_id", status, startedAt, answeredAt, durationSec, recording, transcriptStatus, analysisStatus, own }
    public init(id: String, status: String, startedAt: Date? = nil, answeredAt: Date? = nil, durationSec: Int? = nil,
                recording: CallRecordingState? = nil, transcriptStatus: String? = nil, analysisStatus: String? = nil, own: Bool? = nil) {
        self.id = id; self.status = status; self.startedAt = startedAt; self.answeredAt = answeredAt; self.durationSec = durationSec
        self.recording = recording; self.transcriptStatus = transcriptStatus; self.analysisStatus = analysisStatus; self.own = own
    }
    /// Plus rien à attendre du serveur pour cet appel (transcript et analyse réglés, ou rien d'enregistré).
    public var isSettled: Bool {
        guard answeredAt != nil, let recording, recording.status != "NONE", !recording.objection else { return true }
        if ["FAILED", "SKIPPED"].contains(transcriptStatus ?? "") { return true }
        guard transcriptStatus == "DONE" else { return false }
        return analysisStatus != nil && analysisStatus != "PENDING"
    }
}

public struct CallHold: Codable, Sendable, Equatable {
    public var reason: String?
    public var call: String?
}

/// Fiche de la file d'appels, dans la forme commune à l'externe et à l'équipe (`toRepLead`).
public struct CallQueueLead: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var company: String
    public var contactName: String?
    public var status: String
    public var nextActionAt: Date?
    public var lastCallOutcome: String?
    public var lastCallAt: Date?
    public var callHold: CallHold?
    enum CodingKeys: String, CodingKey { case id = "_id", company, contactName, status, nextActionAt, lastCallOutcome, lastCallAt, callHold }
    public init(id: String, company: String, contactName: String?, status: String, nextActionAt: Date? = nil,
                lastCallOutcome: String? = nil, lastCallAt: Date? = nil, callHold: CallHold? = nil) {
        self.id = id; self.company = company; self.contactName = contactName; self.status = status
        self.nextActionAt = nextActionAt; self.lastCallOutcome = lastCallOutcome; self.lastCallAt = lastCallAt; self.callHold = callHold
    }
}

public struct QuickCallInput: Encodable, Sendable, Equatable {
    public var clientRequestId: String
    public var outcome: String
    public var note: String
    public var scriptTag: String?
    public var nextActionAt: Date?
    public var callId: String?
    public init(clientRequestId: String, outcome: String, note: String, scriptTag: String?, nextActionAt: Date?, callId: String?) {
        self.clientRequestId = clientRequestId; self.outcome = outcome; self.note = note
        self.scriptTag = scriptTag; self.nextActionAt = nextActionAt; self.callId = callId
    }
}

public protocol CallDeskAPI: Sendable {
    func config() async throws -> CallConfig
    func settings() async throws -> CallDeskSettings
    func token() async throws -> VoiceToken
    /// Crée l'appel côté serveur (gardes, plage, plafond, opposition) ; rejouable sur `clientRequestId`.
    func startCall(leadId: String, clientRequestId: String) async throws -> String
    func call(id: String) async throws -> CallRecord
    func hangup(id: String) async throws
    func stopRecording(id: String) async throws -> CallRecordingState
    func leadCalls(leadId: String) async throws -> [LeadCall]
    func queue(mine: Bool) async throws -> [CallQueueLead]
    func quickCall(leadId: String, input: QuickCallInput) async throws
}

public struct LiveCallDeskAPI: CallDeskAPI {
    public static let teamPrefix = "/api/admin/call-desk"
    let session: AuthSession
    let prefix: String
    public init(session: AuthSession, prefix: String = LiveCallDeskAPI.teamPrefix) { self.session = session; self.prefix = prefix }

    private func send(_ path: String, method: String = "GET", query: [URLQueryItem] = [], body: Data? = nil) async throws -> Data {
        let scope = try await session.identity()
        return try await session.data(for: session.request(path: prefix + path, method: method, query: query, body: body), scope: scope)
    }
    private func decode<T: Decodable>(_ type: T.Type, _ data: Data) throws -> T { try ServerCoding.decoder().decode(type, from: data) }

    public func config() async throws -> CallConfig { try decode(CallConfig.self, await send("/calls/config")) }
    public func settings() async throws -> CallDeskSettings { try decode(CallDeskSettings.self, await send("/calls/settings")) }
    public func token() async throws -> VoiceToken { try decode(VoiceToken.self, await send("/calls/token", method: "POST")) }
    public func startCall(leadId: String, clientRequestId: String) async throws -> String {
        struct Created: Decodable { var callId: String }
        let body = try JSONEncoder().encode(["clientRequestId": clientRequestId])
        return try decode(Created.self, await send("/leads/\(leadId)/calls", method: "POST", body: body)).callId
    }
    public func call(id: String) async throws -> CallRecord { try decode(CallRecord.self, await send("/calls/\(id)")) }
    public func hangup(id: String) async throws { _ = try await send("/calls/\(id)/hangup", method: "POST") }
    public func stopRecording(id: String) async throws -> CallRecordingState {
        struct Stopped: Decodable { var recording: CallRecordingState }
        return try decode(Stopped.self, await send("/calls/\(id)/recording/stop", method: "POST")).recording
    }
    public func leadCalls(leadId: String) async throws -> [LeadCall] {
        struct Calls: Decodable { var calls: [LeadCall]? }
        return try decode(Calls.self, await send("/leads/\(leadId)/calls")).calls ?? []
    }
    public func queue(mine: Bool) async throws -> [CallQueueLead] {
        struct Queue: Decodable { var leads: [CallQueueLead] }
        return try decode(Queue.self, await send("/calls/queue", query: [URLQueryItem(name: "mine", value: mine ? "1" : "0")])).leads
    }
    public func quickCall(leadId: String, input: QuickCallInput) async throws {
        _ = try await send("/leads/\(leadId)/quick-call", method: "POST", body: ServerCoding.encoder().encode(input))
    }
}

/// Code d'erreur du serveur (`{ code }`), pour les messages et le repli `tel:`.
public func callDeskErrorCode(_ error: Error) -> String? {
    if let failure = error as? HTTPFailure { return failure.code }
    if let failure = error as? VenioAPIError { return failure.code }
    return nil
}
