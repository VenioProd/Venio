#if os(iOS)
import AVFAudio
import CallKit
import Foundation
import TwilioVoice
import VenioCore

/// Le son d'un appel : Twilio Voice, ou sa simulation en Debug. CallKit ne connaît que lui.
@MainActor protocol VoiceMedia: AnyObject {
    var onEvent: (@MainActor (MediaEvent) -> Void)? { get set }
    func prepareAudio()
    func setAudioActive(_ active: Bool)
    func connect(token: String, callId: String, edge: String?, uuid: UUID)
    func disconnect()
    func setMuted(_ muted: Bool)
    func sendDigits(_ digits: String)
}

enum MediaEvent { case ringing, connected, reconnecting, reconnected, failedToConnect, disconnected(failed: Bool) }

/// Appels sortants présentés par CallKit : écran d'appel du système, écouteurs et AirPods, muet et
/// clavier depuis l'écran verrouillé. Le correspondant affiché est le nom de la fiche, jamais un
/// numéro, et l'appel n'entre pas dans l'historique du téléphone (on ne doit pas pouvoir le rappeler
/// hors de Venio, donc hors des gardes du serveur).
@MainActor final class CallKitVoiceEngine: NSObject, VoiceEngine {
    var onEvent: (@MainActor (VoiceEvent) -> Void)?
    private let provider: CXProvider
    private let controller = CXCallController()
    private let media: any VoiceMedia
    private var current: UUID?
    private var pending: (callId: String, token: String, edge: String?)?
    private var endedLocally = false

    init(media: any VoiceMedia) {
        self.media = media
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = false
        configuration.maximumCallGroups = 1
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic]
        configuration.includesCallsInRecents = false
        provider = CXProvider(configuration: configuration)
        super.init()
        provider.setDelegate(self, queue: nil)
        media.onEvent = { [weak self] event in self?.handle(event) }
    }

    func requestMicrophone() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: true
        case .denied: false
        default: await AVAudioApplication.requestRecordPermission()
        }
    }

    func start(callId: String, token: String, edge: String?, displayName: String) async throws {
        let uuid = UUID()
        current = uuid; endedLocally = false
        pending = (callId, token, edge)
        let handle = CXHandle(type: .generic, value: displayName)
        do {
            try await controller.request(CXTransaction(action: CXStartCallAction(call: uuid, handle: handle)))
        } catch {
            current = nil; pending = nil
            throw error
        }
        let update = CXCallUpdate()
        update.remoteHandle = handle
        update.localizedCallerName = displayName
        update.hasVideo = false
        update.supportsDTMF = true
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        provider.reportCall(with: uuid, updated: update)
    }

    func end() {
        guard let current else { return }
        endedLocally = true
        controller.request(CXTransaction(action: CXEndCallAction(call: current))) { [weak self] error in
            // CallKit n'a pas pris la fin (appel déjà terminé de son côté) : on coupe le son quand même.
            guard error != nil else { return }
            Task { @MainActor in self?.media.disconnect() }
        }
    }

    func setMuted(_ muted: Bool) {
        guard let current else { return }
        controller.request(CXTransaction(action: CXSetMutedCallAction(call: current, muted: muted))) { _ in }
    }

    func sendDigits(_ digits: String) {
        guard let current else { return }
        controller.request(CXTransaction(action: CXPlayDTMFCallAction(call: current, digits: digits, type: .singleTone))) { _ in }
    }

    private func handle(_ event: MediaEvent) {
        guard let current else { return }
        switch event {
        case .ringing: onEvent?(.ringing)
        case .connected:
            provider.reportOutgoingCall(with: current, connectedAt: nil)
            onEvent?(.connected)
        case .reconnecting: onEvent?(.reconnecting)
        case .reconnected: onEvent?(.reconnected)
        case .failedToConnect: finish(reason: .failed, failed: true)
        case .disconnected(let failed): finish(reason: failed ? .failed : .remoteEnded, failed: failed)
        }
    }

    private func finish(reason: CXCallEndedReason, failed: Bool) {
        guard let current else { return }
        if !endedLocally { provider.reportCall(with: current, endedAt: nil, reason: reason) }
        self.current = nil; pending = nil
        onEvent?(.ended(failed: failed))
    }
}

// Délégué posé sur la file principale (`queue: nil`) : les méthodes sont isolées au thread principal.
extension CallKitVoiceEngine: @preconcurrency CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {
        media.disconnect()
        if current != nil { finish(reason: .failed, failed: true) }
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        guard action.callUUID == current, let pending else { action.fail(); return }
        media.prepareAudio()
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: nil)
        media.connect(token: pending.token, callId: pending.callId, edge: pending.edge, uuid: action.callUUID)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        // Raccroché depuis l'écran du système ou les AirPods : même chemin que le bouton de l'app.
        endedLocally = true
        media.disconnect()
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        media.setMuted(action.isMuted)
        onEvent?(.muted(action.isMuted))
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXPlayDTMFCallAction) {
        media.sendDigits(action.digits)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) { media.setAudioActive(true) }
    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) { media.setAudioActive(false) }
}

/// Twilio Voice : `connect` avec le jeton et le seul `callId` ; le TwiML du serveur compose le numéro lu sur la fiche.
@MainActor final class TwilioVoiceMedia: NSObject, VoiceMedia {
    var onEvent: (@MainActor (MediaEvent) -> Void)?
    private let audioDevice = DefaultAudioDevice()
    private var call: Call?

    override init() {
        super.init()
        TwilioVoiceSDK.audioDevice = audioDevice
    }

    func prepareAudio() {
        // CallKit active la session audio ; le SDK ne doit pas la prendre avant.
        audioDevice.isEnabled = false
        audioDevice.block()
    }

    func setAudioActive(_ active: Bool) { audioDevice.isEnabled = active }

    func connect(token: String, callId: String, edge: String?, uuid: UUID) {
        if let edge, !edge.isEmpty { TwilioVoiceSDK.edge = edge }
        let options = ConnectOptions(accessToken: token) { builder in
            builder.params = ["callId": callId]
            builder.uuid = uuid
        }
        call = TwilioVoiceSDK.connect(options: options, delegate: self)
    }

    func disconnect() {
        // Pas encore d'appel côté SDK : rien ne rappellera `callDidDisconnect`, on termine ici.
        if let call { call.disconnect() } else { onEvent?(.disconnected(failed: false)) }
    }
    func setMuted(_ muted: Bool) { call?.isMuted = muted }
    func sendDigits(_ digits: String) { call?.sendDigits(digits) }

    private func emit(_ event: MediaEvent) {
        if case .disconnected = event { call = nil }
        if case .failedToConnect = event { call = nil }
        onEvent?(event)
    }
}

// Le SDK rappelle sur la file principale (pas de `delegateQueue` dans les options).
extension TwilioVoiceMedia: @preconcurrency CallDelegate {
    func callDidStartRinging(call: Call) { emit(.ringing) }
    func callDidConnect(call: Call) { emit(.connected) }
    func callDidFailToConnect(call: Call, error: Error) { emit(.failedToConnect) }
    func callDidDisconnect(call: Call, error: Error?) { emit(.disconnected(failed: error != nil)) }
    func callIsReconnecting(call: Call, error: Error) { emit(.reconnecting) }
    func callDidReconnect(call: Call) { emit(.reconnected) }
}

#if targetEnvironment(simulator)
/// Le simulateur n'a pas d'interface d'appel : le système y coupe tout appel CallKit dès son départ
/// (échec d'ouverture de `facetime://?showInCallUI=1`). Même moteur sans CallKit, pour la recette seulement.
@MainActor final class DirectVoiceEngine: VoiceEngine {
    var onEvent: (@MainActor (VoiceEvent) -> Void)?
    private let media: any VoiceMedia
    private var active = false

    init(media: any VoiceMedia) {
        self.media = media
        media.onEvent = { [weak self] event in
            guard let self, self.active else { return }
            switch event {
            case .ringing: self.onEvent?(.ringing)
            case .connected: self.onEvent?(.connected)
            case .reconnecting: self.onEvent?(.reconnecting)
            case .reconnected: self.onEvent?(.reconnected)
            case .failedToConnect: self.active = false; self.onEvent?(.ended(failed: true))
            case .disconnected(let failed): self.active = false; self.onEvent?(.ended(failed: failed))
            }
        }
    }

    func requestMicrophone() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: true
        case .denied: false
        default: await AVAudioApplication.requestRecordPermission()
        }
    }
    func start(callId: String, token: String, edge: String?, displayName: String) async throws {
        active = true
        media.connect(token: token, callId: callId, edge: edge, uuid: UUID())
    }
    func end() { if active { media.disconnect() } }
    func setMuted(_ muted: Bool) { media.setMuted(muted); onEvent?(.muted(muted)) }
    func sendDigits(_ digits: String) { media.sendDigits(digits) }
}
#endif

#if DEBUG
/// Simulation pour le simulateur et le mode mock : pas de son. Avec `operatorURL`, un faux Twilio local
/// (outil de recette, hors dépôt) reçoit le jeton et le `callId`, joue les rappels signés vers le
/// serveur local et dit quand le prospect décroche ou raccroche.
@MainActor final class SimulatedVoiceMedia: VoiceMedia {
    var onEvent: (@MainActor (MediaEvent) -> Void)?
    private let operatorURL: URL?
    private var callId: String?
    private var task: Task<Void, Never>?

    init(operatorURL: URL?) { self.operatorURL = operatorURL }

    func prepareAudio() {}
    func setAudioActive(_ active: Bool) {}
    func setMuted(_ muted: Bool) {}
    func sendDigits(_ digits: String) {}

    func connect(token: String, callId: String, edge: String?, uuid: UUID) {
        self.callId = callId
        task = Task { [weak self, operatorURL] in
            guard let operatorURL else {
                try? await Task.sleep(for: .milliseconds(700)); self?.onEvent?(.ringing)
                try? await Task.sleep(for: .milliseconds(1500)); self?.onEvent?(.connected)
                return
            }
            // Le faux opérateur répond par une suite d'événements : `ringing`, `connected`, puis `ended` s'il raccroche.
            do {
                var request = URLRequest(url: operatorURL.appending(path: "connect"))
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONEncoder().encode(["token": token, "callId": callId])
                let (lines, _) = try await URLSession.shared.bytes(for: request)
                for try await line in lines.lines {
                    switch line {
                    case "ringing": self?.onEvent?(.ringing)
                    case "connected": self?.onEvent?(.connected)
                    case "ended": self?.onEvent?(.disconnected(failed: false)); return
                    case "failed": self?.onEvent?(.failedToConnect); return
                    default: break
                    }
                }
            } catch is CancellationError {
            } catch { self?.onEvent?(.failedToConnect) }
        }
    }

    func disconnect() {
        task?.cancel(); task = nil
        guard let callId else { return }
        self.callId = nil
        if let operatorURL {
            var request = URLRequest(url: operatorURL.appending(path: "hangup"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONEncoder().encode(["callId": callId])
            Task { _ = try? await URLSession.shared.data(for: request) }
        }
        onEvent?(.disconnected(failed: false))
    }
}
#endif
#endif
