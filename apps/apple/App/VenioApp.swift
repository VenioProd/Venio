import SwiftUI
import SwiftData
import VenioCore
import VenioTheme
import VenioCommercial
import VenioAdmin
import CoreSpotlight
#if os(iOS)
import UIKit
#else
import AppKit
#endif

@main struct VenioApp: App {
    #if os(iOS)
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var watch = WatchBridge()
    @State private var meetings = MeetingActivityController()
    #else
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    #endif
    @State private var mockStore: CommercialStore?
    @State private var session: SessionModel?
    @State private var lock = AppLock.shared
    @State private var themes: ThemeManager
    private let mockAPI: MockVenioAPI?
    private let initialTab: CommercialTab
    private let initialLeadID: String?
    private let initialAdminSection: AdminSection?
    private let initialAdminItemID: String?
    private let initialProjectID: String?

    init() {
        let defaults = UserDefaults.standard
        initialAdminSection = defaults.string(forKey: "VenioAdminSection").flatMap(AdminSection.init(rawValue:))
        initialAdminItemID = defaults.string(forKey: "VenioAdminItem")
        let manager = ThemeManager()
        let stored = manager.selection
        let theme = defaults.string(forKey: "VenioTheme").flatMap(ThemeKind.init(rawValue:)) ?? stored.theme
        if ["VenioTheme", "VenioBackground", "VenioAccent", "VenioLocale"].contains(where: { defaults.string(forKey: $0) != nil }) {
            manager.select(ThemeSelection(theme: theme,
                background: defaults.string(forKey: "VenioBackground") ?? (theme == stored.theme ? stored.background : theme.backgrounds[0]),
                accent: defaults.string(forKey: "VenioAccent") ?? (theme == stored.theme ? stored.accent : theme.accents[0]),
                locale: defaults.string(forKey: "VenioLocale") ?? stored.locale, autoTranslate: stored.autoTranslate))
        }
        _themes = State(initialValue: manager)
        initialTab = defaults.string(forKey: "VenioTab").flatMap(CommercialTab.init(rawValue:)) ?? .today
        initialLeadID = defaults.string(forKey: "VenioLead")
        initialProjectID = defaults.string(forKey: "VenioProject")
        do {
            let configuration = try BackendConfiguration()
            if configuration.backend == .mock {
                let clock = defaults.string(forKey: "VenioNow").flatMap { ISO8601DateFormatter().date(from: $0) }
                    .map { DemoClock(now: $0) } ?? DemoClock()
                let mock: MockVenioAPI
                if defaults.string(forKey: "VenioMockRole") == "admin" { mock = MockVenioAPI(clock: clock, user: MockAdminAPI.demoUser) }
                else { mock = MockVenioAPI(clock: clock) }
                mockAPI = mock
                _mockStore = State(initialValue: CommercialStore(api: mock, clock: clock))
                _session = State(initialValue: nil)
            } else {
                let container = try ModelContainer(for: SyncedRecord.self, SyncCursor.self, PendingWrite.self,
                    configurations: ModelConfiguration("VenioSync-" + (configuration.baseURL.scheme ?? "") + "-" + (configuration.baseURL.host ?? "") + "-" + String(configuration.baseURL.port ?? (configuration.baseURL.scheme == "http" ? 80 : 443))))
                let store = SyncStore(modelContainer: container)
                let auth = try AuthSession(baseURL: configuration.baseURL, transport: URLSessionTransport(),
                    tokenStore: KeychainTokenStore(service: "paris.venio.mobile." + configuration.baseURL.absoluteString),
                    deviceInfo: Self.deviceInfo(), dataStore: store)
                let api = LiveVenioAPI(session: auth, store: store)
                _session = State(initialValue: SessionModel(api: api, themes: manager))
                mockAPI = nil
                _mockStore = State(initialValue: nil)
            }
        } catch {
            mockAPI = nil
            _mockStore = State(initialValue: nil)
            _session = State(initialValue: nil)
        }
        IntentBridge.connect(store: currentStore, session: session)
        IntentBridge.locale = manager.locale
    }
    private static func deviceInfo() -> DeviceInfo {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1"
        #if os(iOS)
        let device = UIDevice.current
        return DeviceInfo(platform: device.userInterfaceIdiom == .pad ? "ipados" : "ios", name: device.name,
            model: device.model, osVersion: device.systemVersion, appVersion: version)
        #else
        return DeviceInfo(platform: "macos", name: Host.current().localizedName ?? "Mac", model: "Mac",
            osVersion: ProcessInfo.processInfo.operatingSystemVersionString, appVersion: version)
        #endif
    }
    private var currentStore: CommercialStore? { session?.commercial ?? mockStore }
    private var currentAPI: (any VenioAPI)? {
        if let session { return session.api }
        return mockAPI
    }

    var body: some Scene {
        WindowGroup {
            ThemeHost(manager: themes) {
                Group {
                    if let session { SessionRootView(session: session, initialTab: initialTab, initialLeadID: initialLeadID, initialProjectID: initialProjectID, initialAdminSection: initialAdminSection, initialAdminItemID: initialAdminItemID) }
                    else if let mockStore { RootView(store: mockStore, initialTab: initialTab, initialLeadID: initialLeadID, initialProjectID: initialProjectID, initialAdminSection: initialAdminSection, initialAdminItemID: initialAdminItemID) }
                    else { StorageUnavailableView() }
                }
                .venioAppLock(lock)
                .onChange(of: currentStore.map(ObjectIdentifier.init), initial: true) { _, _ in
                    if let store = currentStore { IntentBridge.connect(store: store, session: session) }
                }
                .onChange(of: lock.blocksAccess) { _, blocked in
                    if !blocked { Task { await currentStore?.resumeNavigation() } }
                }
                .onChange(of: currentStore?.hasLoaded, initial: true) { _, loaded in
                    guard loaded == true, let store = currentStore, let api = currentAPI else { return }
                    Task { await delegate.push.connected(api: api, store: store, language: themes.locale.language.languageCode?.identifier ?? "fr") }
                    #if os(iOS)
                    watch.publishSnapshot()
                    #endif
                }
                .onChange(of: themes.locale) { _, locale in
                    IntentBridge.locale = locale
                    guard let store = currentStore, store.hasLoaded, let api = currentAPI else { return }
                    Task { await delegate.push.connected(api: api, store: store, language: locale.language.languageCode?.identifier ?? "fr") }
                }
                .task {
                    session?.onDisconnect = {
                        delegate.push.disconnected()
                        IntentBridge.connect(store: nil, session: nil)
                        #if os(iOS)
                        watch.disconnected()
                        meetings.refresh(store: nil, themes: themes, mock: mockAPI != nil)
                        #endif
                    }
                    if let session, !session.starting, case .signedOut = session.state { session.onDisconnect?() }
                    #if os(iOS)
                    session?.additionalPendingCount = { watch.pendingNotes.count }
                    session?.discardAdditionalPending = { watch.discardPendingNotes() }
                    watch.usesLiveBackend = session != nil
                    watch.activate()
                    #endif
                }
                #if os(iOS)
                .modifier(WidgetIntegration(store: currentStore, themes: themes, mock: mockAPI != nil, controller: meetings))
                .onChange(of: currentStore.map(ObjectIdentifier.init), initial: true) { _, _ in
                    watch.usesLiveBackend = session != nil
                    watch.store = currentStore
                    watch.liveAPI = session?.api
                    currentStore?.onLeadOpened = { lead in watch.publish(lead) }
                    watch.publishSnapshot()
                }
                .onChange(of: currentStore?.leads.map { $0.id + String($0.updatedAt.timeIntervalSince1970) + String($0.nextActionAt?.timeIntervalSince1970 ?? 0) + $0.contactPhone }) { _, _ in watch.publishSnapshot() }
                .onChange(of: currentStore?.quotes.map { $0.id + String($0.updatedAt.timeIntervalSince1970) }) { _, _ in watch.publishSnapshot() }
                .onChange(of: currentStore?.currentUser?.id, initial: true) { _, _ in
                    Task { await watch.retryPendingNotes() }
                }
                .overlay(alignment: .top) {
                    VStack {
                        if watch.failed { Text("Transmission Watch impossible", bundle: .main).padding().venioCard() }
                        if !watch.pendingNotes.isEmpty {
                            Button { Task { await watch.retryPendingNotes() } } label: {
                                Text("Réessayer les notes Watch (\(watch.pendingNotes.count))", bundle: .main)
                            }.disabled(watch.retrying).padding().venioCard()
                        }
                    }
                }
                #endif
            }
            .onOpenURL { url in Task { await delegate.push.open(type: "", link: url.absoluteString) } }
            .onContinueUserActivity(CSSearchableItemActionType) { activity in
                guard let identifier = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String else { return }
                let parts = identifier.split(separator: ":", maxSplits: 1).map(String.init)
                guard parts.count == 2, ["lead", "project"].contains(parts[0]) else { return }
                Task { await delegate.push.open(type: "", link: "venio://" + parts[0] + "/" + parts[1]) }
            }
        }
    }
}

private struct StorageUnavailableView: View {
    @Environment(\.locale) private var locale
    var body: some View {
        let language = locale.language.languageCode?.identifier == "fr" ? "fr" : "en"
        let bundle = Bundle.main.path(forResource: language, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
        ContentUnavailableView(bundle.localizedString(forKey: "Stockage ou configuration indisponible", value: nil, table: "Localizable"), systemImage: "externaldrive.badge.exclamationmark")
    }
}
