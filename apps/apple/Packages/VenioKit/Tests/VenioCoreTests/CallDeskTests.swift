import Foundation
import Testing
@testable import VenioCore

@MainActor private final class FakeEngine: VoiceEngine {
    var onEvent: (@MainActor (VoiceEvent) -> Void)?
    var microphone = true
    var started: [(callId: String, token: String, edge: String?)] = []
    var ended = 0
    var digits: [String] = []
    func requestMicrophone() async -> Bool { microphone }
    func start(callId: String, token: String, edge: String?, displayName: String) async throws { started.append((callId, token, edge)) }
    func end() { ended += 1; onEvent?(.ended(failed: false)) }
    func setMuted(_ muted: Bool) { onEvent?(.muted(muted)) }
    func sendDigits(_ digits: String) { self.digits.append(digits) }
}

/// Refuse le lancement avec un code du serveur, comme `POST /leads/:id/calls`.
private actor RefusingAPI: CallDeskAPI {
    let code: String
    init(code: String) { self.code = code }
    func config() async throws -> CallConfig { CallConfig(enabled: true) }
    func settings() async throws -> CallDeskSettings { CallDeskSettings(outcomes: [], scriptTags: []) }
    func token() async throws -> VoiceToken { VoiceToken(token: "t", identity: "u_1") }
    func startCall(leadId: String, clientRequestId: String) async throws -> String { throw HTTPFailure(status: 409, code: code) }
    func call(id: String) async throws -> CallRecord { throw HTTPFailure(status: 404, code: "NOT_FOUND") }
    func hangup(id: String) async throws {}
    func stopRecording(id: String) async throws -> CallRecordingState { throw HTTPFailure(status: 404, code: "NOT_FOUND") }
    func leadCalls(leadId: String) async throws -> [LeadCall] { [] }
    func queue(mine: Bool) async throws -> [CallQueueLead] { [] }
    func quickCall(leadId: String, input: QuickCallInput) async throws {}
}

@MainActor private func makeDesk(_ api: any CallDeskAPI, engine: FakeEngine = FakeEngine()) async -> (CallDesk, FakeEngine) {
    let desk = CallDesk(api: api, engine: engine, pause: { _ in })
    await desk.prepare()
    return (desk, engine)
}

@MainActor private func waitUntil(_ condition: () -> Bool) async {
    for _ in 0..<200 where !condition() { await Task.yield() }
}

@Test @MainActor func callConnectsByCallIdThenPreselectsTheServerOutcome() async throws {
    let api = MockCallDeskAPI()
    await api.setAnswers(false)
    let (desk, engine) = await makeDesk(api)
    #expect(desk.canCall)
    await desk.start(leadId: "lead-1", leadName: "Atelier Alpha")
    // Le moteur reçoit le jeton et l'identifiant d'appel du serveur, l'edge de la configuration ; aucun numéro.
    #expect(engine.started.count == 1)
    #expect(engine.started.first?.token == "jeton-simule" && engine.started.first?.edge == "dublin")
    #expect(desk.phase == .connecting)
    engine.onEvent?(.ringing)
    #expect(desk.phase == .ringing)
    engine.onEvent?(.ended(failed: false))
    await waitUntil { desk.finished != nil }
    #expect(desk.phase == .idle)
    #expect(desk.finished?.record?.suggestedOutcome == "NO_ANSWER")
    #expect(desk.finished?.leadId == "lead-1")
}

@Test @MainActor func refusedMicrophoneKeepsTheTelLinkWithoutCreatingACall() async throws {
    let api = MockCallDeskAPI()
    let engine = FakeEngine()
    engine.microphone = false
    let (desk, _) = await makeDesk(api, engine: engine)
    await desk.start(leadId: "lead-1", leadName: "Alpha")
    #expect(desk.failure == .fallback(.microphoneDenied))
    #expect(!desk.canCall)
    #expect(engine.started.isEmpty)
    #expect(try await api.leadCalls(leadId: "lead-1").isEmpty)
}

@Test @MainActor func disabledTelephonyFallsBackToTel() async throws {
    let (desk, _) = await makeDesk(MockCallDeskAPI(enabled: false))
    #expect(!desk.canCall)
    // Activée entre-temps côté configuration mais refusée au jeton : repli aussi.
    let api = MockCallDeskAPI()
    let (late, engine) = await makeDesk(api)
    await api.setEnabled(false)
    await late.start(leadId: "lead-1", leadName: "Alpha")
    #expect(late.failure == .fallback(.disabled))
    #expect(!late.canCall && engine.started.isEmpty)
}

@Test @MainActor func serverGuardsAreReportedByCode() async throws {
    let (desk, engine) = await makeDesk(RefusingAPI(code: "OUTSIDE_CALLING_HOURS"))
    await desk.start(leadId: "lead-1", leadName: "Alpha")
    #expect(desk.failure == .server("OUTSIDE_CALLING_HOURS"))
    #expect(desk.phase == .idle && engine.started.isEmpty)
    // Un refus ponctuel ne fait pas passer au lien `tel:`.
    #expect(desk.canCall)
}

@Test @MainActor func objectionStopsRecordingOnceConfirmedAndCanBeReplayed() async throws {
    let api = MockCallDeskAPI()
    let (desk, engine) = await makeDesk(api)
    await desk.start(leadId: "lead-1", leadName: "Alpha")
    engine.onEvent?(.connected)
    #expect(desk.phase == .active)
    await desk.stopRecording()
    #expect(desk.recordingStop == .stopped)
    await desk.stopRecording()
    let call = try await api.call(id: desk.callId!)
    #expect(call.recording == CallRecordingState(status: "STOPPED", objection: true))
}

@Test @MainActor func hangupClosesTheServerCallAndMuteAndDigitsGoToTheEngine() async throws {
    let api = MockCallDeskAPI()
    let (desk, engine) = await makeDesk(api)
    await desk.start(leadId: "lead-1", leadName: "Alpha")
    engine.onEvent?(.connected)
    desk.toggleMute()
    #expect(desk.muted)
    desk.sendDigits("12#")
    desk.sendDigits("+33")
    #expect(engine.digits == ["12#"])
    let id = desk.callId!
    desk.hangup()
    await waitUntil { desk.finished != nil }
    #expect(engine.ended == 1)
    #expect(desk.finished?.id == id && !desk.muted)
    await waitUntil { false }
    #expect(await api.hangups == [id])
}
