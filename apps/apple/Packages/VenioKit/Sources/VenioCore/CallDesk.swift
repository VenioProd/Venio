import Foundation
import Observation

/// Ce que remonte le moteur vocal (Twilio présenté par CallKit, ou sa simulation).
public enum VoiceEvent: Sendable, Equatable {
    case ringing, connected, reconnecting, reconnected
    case muted(Bool)
    /// Fin de l'appel, raccroché d'un côté ou de l'autre (`failed` : coupure ou échec de connexion).
    case ended(failed: Bool)
}

/// Moteur vocal. L'app lui passe le jeton et l'identifiant d'appel du serveur, jamais un numéro.
@MainActor public protocol VoiceEngine: AnyObject {
    var onEvent: (@MainActor (VoiceEvent) -> Void)? { get set }
    /// Demande l'accès au micro ; `false` si refusé.
    func requestMicrophone() async -> Bool
    func start(callId: String, token: String, edge: String?, displayName: String) async throws
    func end()
    func setMuted(_ muted: Bool)
    func sendDigits(_ digits: String)
}

public enum CallPhase: String, Sendable { case idle, preparing, connecting, ringing, active, reconnecting, ending }

/// Pourquoi l'app garde le lien `tel:` (téléphonie désactivée, micro refusé).
public enum CallFallback: String, Sendable { case disabled, microphoneDenied }

public enum CallFailure: Sendable, Equatable {
    case fallback(CallFallback)
    /// Refus du serveur : `PHONE_SUPPRESSED`, `OUTSIDE_CALLING_HOURS`, `ATTEMPT_CAP_REACHED`, `LEAD_NOT_CALLABLE`…
    case server(String)
    case call
}

public enum RecordingStop: Sendable { case idle, pending, stopped, failed }

public struct FinishedCall: Identifiable, Sendable, Equatable {
    public let id: String
    public let leadId: String
    public let leadName: String
    public let record: CallRecord?
    public let elapsedSec: Int
}

/// Un seul appel à la fois, quel que soit l'écran. Même déroulé que la barre d'appel du navigateur :
/// micro, jeton, appel créé par le serveur, puis connexion ; à la fin, l'état final est relu pour
/// présélectionner le résultat.
@Observable @MainActor public final class CallDesk {
    public private(set) var phase: CallPhase = .idle
    public private(set) var leadId: String?
    public private(set) var leadName = ""
    public private(set) var callId: String?
    public private(set) var muted = false
    public private(set) var answeredAt: Date?
    public private(set) var failure: CallFailure?
    public private(set) var config: CallConfig?
    public private(set) var settings: CallDeskSettings?
    public private(set) var recordingStop: RecordingStop = .idle
    /// L'appel qui vient de se terminer : ouvre la saisie du résultat.
    public var finished: FinishedCall?
    public let api: any CallDeskAPI
    /// Origine du site : la validation champ par champ d'une analyse se fait sur la fiche web.
    public let webBaseURL: URL?
    private let engine: (any VoiceEngine)?
    private let now: @Sendable () -> Date
    private let uuid: @Sendable () -> String
    private let pause: @Sendable (Duration) async throws -> Void
    private var aborted = false
    private var unavailable: CallFallback?

    public init(api: any CallDeskAPI, engine: (any VoiceEngine)?, webBaseURL: URL? = nil,
                now: @escaping @Sendable () -> Date = { .now },
                uuid: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() },
                pause: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }) {
        self.api = api; self.engine = engine; self.webBaseURL = webBaseURL; self.now = now; self.uuid = uuid; self.pause = pause
        engine?.onEvent = { [weak self] event in self?.handle(event) }
    }

    public func webLeadURL(_ leadId: String) -> URL? {
        webBaseURL?.appending(path: "admin/crm/leads").appending(path: leadId)
    }

    public var busy: Bool { phase != .idle }
    public var inCall: Bool { phase != .idle && phase != .preparing }
    /// L'app appelle elle-même ; sinon l'écran garde le lien `tel:`.
    public var canCall: Bool { engine != nil && config?.enabled == true && unavailable == nil }
    public var recordingNotice: CallRecordingConfig? { config?.recording?.enabled == true ? config?.recording : nil }

    /// Réglages du serveur ; sans réponse, l'app reste sur le lien `tel:`.
    public func prepare() async {
        guard engine != nil else { return }
        do {
            config = try await api.config()
            if config?.enabled == true, settings == nil { settings = try? await api.settings() }
        } catch { config = nil }
    }

    public func start(leadId: String, leadName: String) async {
        guard !busy, canCall else { return }
        aborted = false
        phase = .preparing; self.leadId = leadId; self.leadName = leadName
        callId = nil; muted = false; answeredAt = nil; failure = nil; finished = nil; recordingStop = .idle
        do {
            guard let engine else { throw CallFallbackError(fallback: .disabled) }
            // Le micro avant tout appel au serveur : une tentative refusée ne compte pas.
            guard await engine.requestMicrophone() else { throw CallFallbackError(fallback: .microphoneDenied) }
            try guardActive()
            let token = try await api.token()
            try guardActive()
            let id = try await api.startCall(leadId: leadId, clientRequestId: uuid())
            callId = id
            phase = .connecting
            try guardActive()
            try await engine.start(callId: id, token: token.token, edge: config?.edge, displayName: leadName)
            if aborted { engine.end() }
        } catch {
            await fail(error)
        }
    }

    public func hangup() {
        guard phase != .idle, phase != .ending else { return }
        aborted = true
        if let callId { Task { [api] in try? await api.hangup(id: callId) } }
        if phase == .preparing { return }
        phase = .ending
        engine?.end()
    }

    public func toggleMute() { if inCall { engine?.setMuted(!muted) } }
    public func sendDigits(_ digits: String) {
        guard inCall, digits.allSatisfy({ "0123456789*#".contains($0) }) else { return }
        engine?.sendDigits(digits)
    }

    /// Le prospect refuse l'enregistrement : arrêt et effacement côté serveur, affiché une fois confirmé. Rejouable.
    public func stopRecording() async {
        guard let id = callId, inCall, recordingStop != .pending, recordingStop != .stopped else { return }
        recordingStop = .pending
        do {
            _ = try await api.stopRecording(id: id)
            if callId == id { recordingStop = .stopped }
        } catch {
            if callId == id { recordingStop = .failed }
        }
    }

    /// Lève un repli mémorisé (micro autorisé depuis les réglages, par exemple).
    public func retry() { if !busy { unavailable = nil; failure = nil } }
    public func dismissFailure() { failure = nil }

    /// Déconnexion ou changement de compte : rien ne doit survivre.
    public func reset() {
        if inCall { engine?.end() }
        phase = .idle; leadId = nil; callId = nil; finished = nil; failure = nil; config = nil; settings = nil; unavailable = nil
    }

    private func guardActive() throws { if aborted { throw CancellationError() } }

    private func handle(_ event: VoiceEvent) {
        switch event {
        case .ringing: if phase == .connecting { phase = .ringing }
        case .connected: phase = .active; answeredAt = now()
        case .reconnecting: phase = .reconnecting
        case .reconnected: phase = .active
        case .muted(let value): muted = value
        case .ended(let failed):
            guard let callId, let leadId, phase != .idle else { return }
            if failed && answeredAt == nil && failure == nil { failure = .call }
            Task { await finish(callId: callId, leadId: leadId) }
        }
    }

    private func finish(callId: String, leadId: String) async {
        guard phase != .idle else { return }
        let elapsed = answeredAt.map { max(0, Int(now().timeIntervalSince($0).rounded())) } ?? 0
        phase = .ending; muted = false
        let record = await settle(callId)
        guard self.callId == callId else { return }
        phase = .idle; answeredAt = nil
        finished = FinishedCall(id: callId, leadId: leadId, leadName: leadName, record: record, elapsedSec: elapsed)
    }

    /// Relit l'appel jusqu'à son état final (le rappel de Twilio arrive après la fin côté app).
    func settle(_ id: String, attempts: Int = 8) async -> CallRecord? {
        var last: CallRecord?
        for index in 0..<attempts {
            if let record = try? await api.call(id: id) {
                last = record
                if record.isFinal { return record }
            }
            if index < attempts - 1 { try? await pause(.milliseconds(1500)) }
        }
        return last
    }

    private func fail(_ error: Error) async {
        let id = callId
        var failure: CallFailure?
        if let hinted = error as? CallFallbackError {
            failure = .fallback(hinted.fallback)
            unavailable = hinted.fallback
        } else if error is CancellationError || aborted {
            failure = nil
        } else if let code = callDeskErrorCode(error) {
            if code == "TELEPHONY_DISABLED" {
                failure = .fallback(.disabled); unavailable = .disabled
            } else if code == "CONNECTION_REQUIRED" {
                failure = .call
            } else { failure = .server(code) }
        } else { failure = .call }
        if let id {
            // L'appel existe côté serveur mais n'est pas parti : on le ferme.
            try? await api.hangup(id: id)
            engine?.end()
        }
        self.failure = failure
        phase = .idle; answeredAt = nil
        if aborted, let id, let leadId {
            finished = FinishedCall(id: id, leadId: leadId, leadName: leadName, record: await settle(id, attempts: 1), elapsedSec: 0)
        }
    }
}

struct CallFallbackError: Error { let fallback: CallFallback }
