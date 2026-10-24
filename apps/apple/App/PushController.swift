import Foundation
import Observation
import UserNotifications
import VenioCore
import VenioCommercial
#if os(iOS)
import UIKit
#else
import AppKit
#endif

@MainActor protocol PushRegistrar: AnyObject {
    func didReceiveDeviceToken(_ token: String) async
}

@Observable @MainActor final class PushController: NSObject, PushRegistrar, UNUserNotificationCenterDelegate {
    private var api: (any VenioAPI)?
    private var store: CommercialStore?
    private var language: String?
    private var token: String?
    private var pendingLink: String?
    private var pendingType = ""
    private var attemptedRegistration = false
    private var connectionID = UUID()
    private(set) var failed = false
    private(set) var needsAuthorization = false

    func connected(api: any VenioAPI, store: CommercialStore, language: String) async {
        let expected = connectionID
        self.api = api
        self.store = store
        self.language = language
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories(Set(["VENIO_LEAD", "VENIO_FOLLOW_UP", "VENIO_QUOTE", "VENIO_PROJECT"].map { UNNotificationCategory(identifier: $0, actions: [], intentIdentifiers: []) }))
        if let pendingLink {
            self.pendingLink = nil
            await open(type: pendingType, link: pendingLink)
        }
        guard !attemptedRegistration else {
            if let token { await didReceiveDeviceToken(token) }
            return
        }
        attemptedRegistration = true
        let settings = await center.notificationSettings()
        guard connectionID == expected, self.api != nil else { return }
        switch settings.authorizationStatus {
        case .notDetermined:
            needsAuthorization = true
            await enableNotifications()
        case .authorized, .provisional: registerWithSystem()
        #if os(iOS)
        case .ephemeral: registerWithSystem()
        #endif
        case .denied:
            do { try await api.unregisterPushToken() }
            catch { failed = true }
        @unknown default: break
        }
    }

    func enableNotifications() async {
        guard needsAuthorization, api != nil else { return }
        let expected = connectionID
        needsAuthorization = false
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            guard connectionID == expected, api != nil else { return }
            needsAuthorization = false
            if granted { registerWithSystem() }
        } catch { failed = true }
    }
    private func registerWithSystem() {
        #if os(iOS)
        UIApplication.shared.registerForRemoteNotifications()
        #else
        NSApplication.shared.registerForRemoteNotifications()
        #endif
    }

    func didReceiveDeviceToken(_ token: String) async {
        self.token = token
        guard let api else { return }
        #if DEBUG
        let environment = PushEnvironment.sandbox
        #else
        let environment = PushEnvironment.production
        #endif
        do {
            try await api.registerPushToken(token, environment: environment, language: language)
            failed = false
        } catch { failed = true }
    }
    func disconnected() {
        connectionID = UUID()
        api = nil; store = nil; pendingLink = nil; pendingType = ""
        needsAuthorization = false; attemptedRegistration = false; failed = false
        let center = UNUserNotificationCenter.current()
        center.removeAllDeliveredNotifications()
        center.removeAllPendingNotificationRequests()
        Task { try? await center.setBadgeCount(0) }
    }
    func registrationFailed() { failed = true }

    func open(type: String, link: String?) async {
        guard let store else { pendingType = type; pendingLink = link; return }
        guard let destination = DeepLink.parse(type: type, link: link) else { store.routeFailed = true; return }
        await store.open(destination)
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
        willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        await presentationOptions(badge: notification.request.content.badge?.intValue)
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse) async {
        let content = response.notification.request.content
        let type = content.userInfo["type"] as? String ?? ""
        let link = content.userInfo["link"] as? String
        await receive(type: type, link: link, badge: content.badge?.intValue)
    }
    private func presentationOptions(badge: Int?) async -> UNNotificationPresentationOptions {
        guard api != nil else { return [] }
        let expected = connectionID
        if let badge { await updateBadge(badge) }
        guard api != nil, connectionID == expected else { return [] }
        return [.banner, .sound, .badge]
    }
    private func receive(type: String, link: String?, badge: Int?) async {
        // Lancement à froid : la session n'est pas encore restaurée, on ouvrira la fiche à la connexion.
        guard api != nil else { pendingType = type; pendingLink = link; return }
        let expected = connectionID
        if let badge { await updateBadge(badge) }
        guard api != nil, connectionID == expected else { return }
        await open(type: type, link: link)
    }
    private func updateBadge(_ badge: Int) async {
        do { try await UNUserNotificationCenter.current().setBadgeCount(badge) }
        catch { failed = true }
    }
}

#if os(iOS)
@MainActor final class AppDelegate: NSObject, UIApplicationDelegate {
    let push = PushController()
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = push
        return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { await push.didReceiveDeviceToken(hex) }
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) { push.registrationFailed() }
}
#else
@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    let push = PushController()
    func applicationDidFinishLaunching(_ notification: Notification) { UNUserNotificationCenter.current().delegate = push }
    func application(_ application: NSApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { await push.didReceiveDeviceToken(hex) }
    }
    func application(_ application: NSApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) { push.registrationFailed() }
}
#endif
