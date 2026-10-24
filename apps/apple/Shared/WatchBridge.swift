#if os(iOS) || os(watchOS)
import Foundation
import Observation
import WatchConnectivity
import VenioCore
#if os(iOS)
import VenioCommercial
#endif

struct WatchFollowUp: Codable, Identifiable {
    var id: String
    var company: String
    var contact: String
    var phone: String
    var date: Date
}

#if os(iOS)
struct PendingWatchNote: Codable {
    var ownerID: String
    var draft: InteractionDraft
}
#endif

@Observable @MainActor final class WatchBridge: NSObject, WCSessionDelegate {
    private(set) var liveBackend: Bool?
    private(set) var followUps: [WatchFollowUp] = []
    private(set) var leadID: String?
    private(set) var company = ""
    private(set) var contact = ""
    private(set) var failed = false
    #if os(iOS)
    var store: CommercialStore?
    var liveAPI: LiveVenioAPI?
    var usesLiveBackend = false
    private var lastLead: Lead?
    private(set) var pendingNotes: [PendingWatchNote] = []
    private(set) var retrying = false
    private let pendingNotesKey = "VenioWatchPendingNotes"
    #endif
    private var session: WCSession?
    private var ownerID: String?

    override init() {
        super.init()
        #if os(iOS)
        if let data = UserDefaults.standard.data(forKey: pendingNotesKey) {
            do {
                if let saved = try? JSONDecoder().decode([PendingWatchNote].self, from: data) { pendingNotes = saved }
                else {
                    // Sans propriétaire fiable, ces notes ne peuvent pas être envoyées.
                    pendingNotes = try JSONDecoder().decode([InteractionDraft].self, from: data).map { PendingWatchNote(ownerID: "", draft: $0) }
                }
            }
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
    func disconnected() {
        store?.onLeadOpened = nil
        store = nil; liveAPI = nil; lastLead = nil
        if let session, session.activationState == .activated {
            do { try session.updateApplicationContext(["backend": usesLiveBackend ? "live" : "mock"]) } catch { failed = true }
        }
    }
    func discardPendingNotes() {
        pendingNotes = []
        UserDefaults.standard.removeObject(forKey: pendingNotesKey)
    }
    func publish(_ lead: Lead) {
        lastLead = lead
        publishSnapshot()
    }
    func publishSnapshot() {
        guard let session, session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        var context: [String: Any] = ["backend": usesLiveBackend ? "live" : "mock"]
        if let lastLead, let user = store?.currentUser {
            context["leadID"] = lastLead.id
            context["company"] = lastLead.company
            context["contact"] = lastLead.contactName
            context["ownerID"] = user.id
        }
        if let store, let user = store.currentUser {
            let leads = (store.agenda.overdue + store.agenda.followUps).prefix(50)
            let followUps = leads.compactMap { lead -> WatchFollowUp? in
                guard let date = lead.nextActionAt else { return nil }
                return WatchFollowUp(id: lead.id, company: lead.company, contact: lead.contactName, phone: lead.contactPhone, date: date)
            }
            if let data = try? JSONEncoder().encode(followUps) { context["followUps"] = data }
            context["ownerID"] = user.id
        }
        do { try session.updateApplicationContext(context); failed = false }
        catch { failed = true }
    }
    func retryPendingNotes() async {
        guard !retrying else { return }
        retrying = true
        defer { retrying = false }
        for note in pendingNotes { await deliver(note) }
    }
    private func savePendingNotes() {
        do { UserDefaults.standard.set(try JSONEncoder().encode(pendingNotes), forKey: pendingNotesKey) }
        catch { failed = true }
    }
    private func deliver(_ note: PendingWatchNote) async {
        guard let store, store.currentUser?.id == note.ownerID else { return }
        do {
            if usesLiveBackend {
                guard let liveAPI else { return }
                let scope = try await liveAPI.session.identity()
                guard scope.user.id == note.ownerID else { return }
                _ = try await liveAPI.createInteraction(note.draft, scope: scope)
            } else { try await store.createInteraction(note.draft) }
            pendingNotes.removeAll { $0.draft.idempotencyKey == note.draft.idempotencyKey }
            savePendingNotes()
            failed = !pendingNotes.isEmpty
        } catch { failed = true }
    }
    #else
    func sendNote(_ text: String, leadID: String) -> Bool {
        guard let session, let ownerID, session.activationState == .activated, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        session.transferUserInfo(["ownerID": ownerID, "leadID": leadID, "text": text, "idempotencyKey": UUID().uuidString, "occurredAt": Date.now.timeIntervalSince1970])
        return true
    }
    #endif

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: (any Error)?) {
        let failed = error != nil
        #if os(watchOS)
        let context = session.receivedApplicationContext
        let data = context["followUps"] as? Data
        let id = context["leadID"] as? String
        let company = context["company"] as? String ?? ""
        let contact = context["contact"] as? String ?? ""
        let owner = context["ownerID"] as? String
        let backend = context["backend"] as? String
        #endif
        Task { @MainActor in
            self.failed = failed
            #if os(iOS)
            self.publishSnapshot()
            #else
            self.apply(id: id, company: company, contact: contact, owner: owner, backend: backend, data: data)
            #endif
        }
    }
    nonisolated func session(_ session: WCSession, didFinish userInfoTransfer: WCSessionUserInfoTransfer, error: (any Error)?) {
        let failed = error != nil
        Task { @MainActor in self.failed = failed }
    }
    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        let data = applicationContext["followUps"] as? Data
        let id = applicationContext["leadID"] as? String
        let company = applicationContext["company"] as? String ?? ""
        let contact = applicationContext["contact"] as? String ?? ""
        let owner = applicationContext["ownerID"] as? String
        let backend = applicationContext["backend"] as? String
        Task { @MainActor in self.apply(id: id, company: company, contact: contact, owner: owner, backend: backend, data: data) }
    }
    private func apply(id: String?, company: String, contact: String, owner: String?, backend: String?, data: Data?) {
        leadID = id; self.company = company; self.contact = contact; ownerID = owner
        liveBackend = backend.map { $0 == "live" }
        followUps = data.flatMap { try? JSONDecoder().decode([WatchFollowUp].self, from: $0) } ?? []
    }
    #if os(iOS)
    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
    nonisolated func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        guard let id = userInfo["leadID"] as? String, let text = userInfo["text"] as? String,
              let key = (userInfo["idempotencyKey"] as? String).flatMap(UUID.init(uuidString:)),
              let timestamp = userInfo["occurredAt"] as? Double, let owner = userInfo["ownerID"] as? String else { return }
        Task { @MainActor in
            guard !self.pendingNotes.contains(where: { $0.draft.idempotencyKey == key }) else { return }
            let draft = InteractionDraft(idempotencyKey: key, subjectType: .lead, subjectId: id,
                kind: .note, body: text, lang: ContentLanguage.detect(text), direction: .none,
                occurredAt: Date(timeIntervalSince1970: timestamp))
            let note = PendingWatchNote(ownerID: owner, draft: draft)
            self.pendingNotes.append(note)
            self.savePendingNotes()
            await self.deliver(note)
        }
    }
    #endif
}
#endif
