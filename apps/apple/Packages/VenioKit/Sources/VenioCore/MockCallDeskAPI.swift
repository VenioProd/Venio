import Foundation

/// Poste d'appel simulé, pour le mode mock, les aperçus et les tests : aucun réseau.
public actor MockCallDeskAPI: CallDeskAPI {
    public static let outcomes = [
        CallOutcome(value: "NO_ANSWER", fr: "Sans réponse", en: "No answer", effect: "NONE"),
        CallOutcome(value: "VOICEMAIL", fr: "Messagerie", en: "Voicemail", effect: "VOICEMAIL"),
        CallOutcome(value: "CALLBACK", fr: "À rappeler", en: "Call back", effect: "CALLBACK"),
        CallOutcome(value: "MEETING_BOOKED", fr: "RDV pris", en: "Meeting booked", effect: "MEETING"),
        CallOutcome(value: "NOT_INTERESTED", fr: "Pas intéressé", en: "Not interested", effect: "LOST"),
        CallOutcome(value: "WRONG_NUMBER", fr: "Mauvais numéro", en: "Wrong number", effect: "WRONG_NUMBER"),
        CallOutcome(value: "DO_NOT_CALL", fr: "Ne plus appeler", en: "Do not call", effect: "DO_NOT_CALL"),
    ]
    public var enabled: Bool
    /// Le prospect décroche ; sinon l'appel finit « sans réponse ».
    public var answers = true
    public private(set) var queueLeads: [CallQueueLead]
    public private(set) var quickCalls: [(leadId: String, input: QuickCallInput)] = []
    public private(set) var hangups: [String] = []
    private var calls: [String: (leadId: String, createdAt: Date, recording: CallRecordingState)] = [:]
    private var requests: [String: String] = [:]
    private let now: @Sendable () -> Date

    public init(enabled: Bool = true, queue: [CallQueueLead] = [], now: @escaping @Sendable () -> Date = { .now }) {
        self.enabled = enabled; self.queueLeads = queue; self.now = now
    }
    public func setAnswers(_ value: Bool) { answers = value }
    public func setEnabled(_ value: Bool) { enabled = value }

    public func config() async throws -> CallConfig {
        CallConfig(enabled: enabled, edge: enabled ? "dublin" : nil, recording: CallRecordingConfig(enabled: true, notice: true))
    }
    public func settings() async throws -> CallDeskSettings { CallDeskSettings(outcomes: Self.outcomes, scriptTags: ["DEFAULT"]) }
    public func token() async throws -> VoiceToken {
        guard enabled else { throw HTTPFailure(status: 503, code: "TELEPHONY_DISABLED") }
        return VoiceToken(token: "jeton-simule", identity: "u_mock")
    }
    public func startCall(leadId: String, clientRequestId: String) async throws -> String {
        guard enabled else { throw HTTPFailure(status: 503, code: "TELEPHONY_DISABLED") }
        if let existing = requests[clientRequestId] { return existing }
        let id = String(format: "%024x", calls.count + 1)
        calls[id] = (leadId, now(), CallRecordingState(status: "RECORDING", objection: false))
        requests[clientRequestId] = id
        return id
    }
    public func call(id: String) async throws -> CallRecord {
        guard let call = calls[id] else { throw HTTPFailure(status: 404, code: "NOT_FOUND") }
        if answers {
            let recording = call.recording.objection ? call.recording : CallRecordingState(status: "DELETED", objection: false)
            return CallRecord(id: id, status: "COMPLETED", answeredAt: call.createdAt.addingTimeInterval(3), durationSec: 95, recording: recording)
        }
        return CallRecord(id: id, status: "NO_ANSWER", suggestedOutcome: "NO_ANSWER", recording: CallRecordingState(status: "NONE", objection: false))
    }
    public func hangup(id: String) async throws { hangups.append(id) }
    public func stopRecording(id: String) async throws -> CallRecordingState {
        guard calls[id] != nil else { throw HTTPFailure(status: 404, code: "NOT_FOUND") }
        calls[id]?.recording = CallRecordingState(status: "STOPPED", objection: true)
        return calls[id]!.recording
    }
    public func leadCalls(leadId: String) async throws -> [LeadCall] {
        calls.filter { $0.value.leadId == leadId }.sorted { $0.value.createdAt > $1.value.createdAt }.map { id, call in
            guard answers else { return LeadCall(id: id, status: "NO_ANSWER", startedAt: call.createdAt, recording: CallRecordingState(status: "NONE", objection: false)) }
            let objection = call.recording.objection
            // Le transcript arrive quelques secondes après la fin, puis l'analyse.
            let ready = now().timeIntervalSince(call.createdAt) > 8
            return LeadCall(id: id, status: "COMPLETED", startedAt: call.createdAt, answeredAt: call.createdAt.addingTimeInterval(3), durationSec: 95,
                            recording: objection ? call.recording : CallRecordingState(status: "DELETED", objection: false),
                            transcriptStatus: objection ? nil : (ready ? "DONE" : "PROCESSING"),
                            analysisStatus: objection ? nil : (ready ? "READY" : nil), own: true)
        }
    }
    public func queue(mine: Bool) async throws -> [CallQueueLead] { queueLeads }
    public func quickCall(leadId: String, input: QuickCallInput) async throws { quickCalls.append((leadId, input)) }
}

extension HTTPFailure {
    init(status: Int, code: String) {
        self.status = status; self.code = code; retryAfter = nil
    }
}
