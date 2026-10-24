#if os(iOS) || os(watchOS)
import Foundation
import Observation
import WatchConnectivity
import VenioCore
#if os(iOS)
import VenioCommercial
#endif

@Observable @MainActor final class WatchBridge: NSObject, WCSessionDelegate {
    private(set) var leadID: String?
    private(set) var company = ""
    private(set) var contact = ""
    private(set) var failed = false
    #if os(iOS)
    var store: CommercialStore?
    private var lastLead: Lead?
    private(set) var pendingNotes: [InteractionDraft] = []
    private(set) var retrying = false
    private let pendingNotesKey = "VenioWatchPendingNotes"
    #endif
    private var session: WCSession?

    override init() {
        super.init()
        #if os(iOS)
        if let data = UserDefaults.standard.data(forKey: pendingNotesKey) {
            do { pendingNotes = try JSONDecoder().decode([InteractionDraft].self, from: data) }
            catch { failed = true }
        }
        #endif
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        session = .default
        session?.delegate = self
        session?.activate()
    }
    #if os(iOS)
    func publish(_ lead: Lead) {
        lastLead = lead
        guard let session, session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        do {
            try session.updateApplicationContext(["leadID": lead.id, "company": lead.company, "contact": lead.contactName])
            failed = false
        } catch { failed = true }
    }
    func retryPendingNotes() async {
        guard !retrying else { return }
        retrying = true
        defer { retrying = false }
        for draft in pendingNotes { await deliver(draft) }
    }
    private func savePendingNotes() {
        do { UserDefaults.standard.set(try JSONEncoder().encode(pendingNotes), forKey: pendingNotesKey) }
        catch { failed = true }
    }
    private func deliver(_ draft: InteractionDraft) async {
        guard let store else { failed = true; return }
        do {
            try await store.createInteraction(draft)
            pendingNotes.removeAll { $0.idempotencyKey == draft.idempotencyKey }
            savePendingNotes()
            failed = !pendingNotes.isEmpty
        } catch { failed = true }
    }
    #else
    func sendNote(_ text: String, leadID: String) -> Bool {
        guard let session, session.activationState == .activated, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        session.transferUserInfo(["leadID": leadID, "text": text, "idempotencyKey": UUID().uuidString, "occurredAt": Date.now.timeIntervalSince1970])
        return true
    }
    #endif

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: (any Error)?) {
        let failed = error != nil
        #if os(watchOS)
        let context = session.receivedApplicationContext
        let id = context["leadID"] as? String
        let company = context["company"] as? String ?? ""
        let contact = context["contact"] as? String ?? ""
        #endif
        Task { @MainActor in
            self.failed = failed
            #if os(iOS)
            if let lead = self.lastLead { self.publish(lead) }
            #else
            self.leadID = id
            self.company = company
            self.contact = contact
            #endif
        }
    }
    nonisolated func session(_ session: WCSession, didFinish userInfoTransfer: WCSessionUserInfoTransfer, error: (any Error)?) {
        let failed = error != nil
        Task { @MainActor in self.failed = failed }
    }
    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        let id = applicationContext["leadID"] as? String
        let company = applicationContext["company"] as? String ?? ""
        let contact = applicationContext["contact"] as? String ?? ""
        Task { @MainActor in self.leadID = id; self.company = company; self.contact = contact }
    }
    #if os(iOS)
    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
    nonisolated func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        guard let id = userInfo["leadID"] as? String, let text = userInfo["text"] as? String,
              let key = (userInfo["idempotencyKey"] as? String).flatMap(UUID.init(uuidString:)),
              let timestamp = userInfo["occurredAt"] as? Double else { return }
        Task { @MainActor in
            guard !self.pendingNotes.contains(where: { $0.idempotencyKey == key }) else { return }
            let draft = InteractionDraft(idempotencyKey: key, subjectType: .lead, subjectId: id,
                kind: .note, body: text, lang: ContentLanguage.detect(text), direction: .none,
                occurredAt: Date(timeIntervalSince1970: timestamp))
            self.pendingNotes.append(draft)
            self.savePendingNotes()
            await self.deliver(draft)
        }
    }
    #endif
}
#endif
