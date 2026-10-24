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
    private(set) var failed = false
    private(set) var needsAuthorization = false

    func connected(api: any VenioAPI, store: CommercialStore, language: String) async {
        self.api = api
        self.store = store
        self.language = language
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories([UNNotificationCategory(identifier: "QUOTE_PROPOSAL_VIEWED", actions: [], intentIdentifiers: [])])
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
        guard needsAuthorization else { return }
        needsAuthorization = false
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
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
    func registrationFailed() { failed = true }

    func open(type: String, link: String?) async {
        guard let store else { pendingType = type; pendingLink = link; return }
        guard let destination = DeepLink.parse(type: type, link: link) else { store.routeFailed = true; return }
        await store.open(destination)
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
        willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        if let badge = notification.request.content.badge?.intValue { await updateBadge(badge) }
        return [.banner, .sound, .badge]
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse) async {
        let content = response.notification.request.content
        let type = content.userInfo["type"] as? String ?? ""
        let link = content.userInfo["link"] as? String
        if let badge = content.badge?.intValue { await updateBadge(badge) }
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
