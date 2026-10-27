#if os(iOS)
import SwiftUI
import CoreFoundation
import VenioCore
import VenioCommercial

@MainActor private final class ShareInboxImporter {
    private var importing = false
    private var requested = false
    private let inbox = ShareInboxStore()

    init() {
        CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque(), { _, _, _, _, _ in
            Task { @MainActor in
                NotificationCenter.default.post(name: Notification.Name(ShareInboxStore.notificationName), object: nil)
            }
        }, ShareInboxStore.notificationName as CFString, nil, .deliverImmediately)
    }
    isolated deinit {
        CFNotificationCenterRemoveObserver(CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque(),
                                           CFNotificationName(ShareInboxStore.notificationName as CFString), nil)
    }
    func update(session: SessionModel?) async {
        guard let session else { try? inbox.clearContext(); return }
        requested = true
        guard !importing else { return }
        importing = true
        defer { importing = false }
        repeat {
            requested = false
            guard case .signedIn(let user, _) = session.state,
                  let store = session.commercial, store.hasLoaded, store.currentUser?.id == user.id else {
                try? inbox.clearContext()
                return
            }
            let origin = session.api.session.baseURL.absoluteString
            var failure: (any Error)?
            do {
                try inbox.writeContext(ShareContext(origin: origin, userId: user.id,
                    projects: store.canManageDocuments ? store.projects.map {
                        ShareProject(id: $0.id, name: $0.name, client: $0.clientName, projectNumber: $0.projectNumber)
                    } : [], requiresUnlock: AppLock.shared.enabled))
                for item in try inbox.items() {
                    guard session.commercial === store, case .signedIn(let current, _) = session.state,
                          current.id == user.id else { requested = true; break }
                    do {
                        try await inbox.importItem(item, origin: origin, userId: user.id) { draft in
                            try await store.uploadDocuments([draft])
                        }
                    } catch { failure = error }
                }
                guard session.commercial === store else { requested = true; continue }
                try await session.api.outbox.drain()
                await session.reloadPending()
            } catch { if failure == nil { failure = error } }
            if session.commercial === store, let failure { session.errorKey = mobileErrorKey(failure) }
        } while requested
    }
}

struct ShareInboxIntegration: ViewModifier {
    let session: SessionModel?
    @Environment(\.scenePhase) private var scenePhase
    @State private var importer = ShareInboxImporter()

    private var context: ShareContext? {
        guard let session, case .signedIn(let user, _) = session.state,
              let store = session.commercial, store.hasLoaded, store.currentUser?.id == user.id else { return nil }
        return ShareContext(origin: session.api.session.baseURL.absoluteString, userId: user.id,
            projects: store.canManageDocuments ? store.projects.map {
                ShareProject(id: $0.id, name: $0.name, client: $0.clientName, projectNumber: $0.projectNumber)
            } : [], requiresUnlock: AppLock.shared.enabled, updatedAt: .distantPast)
    }
    func body(content: Content) -> some View {
        content
            .onChange(of: context, initial: true) { _, _ in Task { await importer.update(session: session) } }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await importer.update(session: session) } }
            }
            .onReceive(NotificationCenter.default.publisher(for: Notification.Name(ShareInboxStore.notificationName))) { _ in
                Task { await importer.update(session: session) }
            }
    }
}
#endif
