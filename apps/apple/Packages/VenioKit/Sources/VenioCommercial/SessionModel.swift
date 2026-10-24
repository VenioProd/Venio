import Foundation
import VenioCore
#if !os(watchOS)
import Network
import Observation
import VenioTheme

@Observable @MainActor public final class SessionModel {
    public let api: LiveVenioAPI
    public private(set) var state: SessionState = .signedOut
    public private(set) var commercial: CommercialStore?
    public private(set) var starting = true
    public private(set) var offline = false
    public private(set) var pending: [QueuedWrite] = []
    public private(set) var refreshing = false
    public var errorKey: String?
    public var onDisconnect: (@MainActor () -> Void)?
    public var additionalPendingCount: (@MainActor () -> Int)?
    public var discardAdditionalPending: (@MainActor () -> Void)?
    public var pendingModificationCount: Int { pending.count + (additionalPendingCount?() ?? 0) }
    private let themes: ThemeManager
    private let monitor = NWPathMonitor()
    private var observation: Task<Void, Never>?
    private var updates: Task<Void, Never>?
    private var preferenceWrite: Task<Void, Never>?
    private var started = false
    private var refreshID: UUID?
    private var lastPreferences: MobilePreferences?
    private var connectionTask: Task<Void, Never>?

    public init(api: LiveVenioAPI, themes: ThemeManager) { self.api = api; self.themes = themes }
    isolated deinit { observation?.cancel(); updates?.cancel(); preferenceWrite?.cancel(); connectionTask?.cancel(); monitor.cancel() }

    public func start() async {
        guard !started else { return }
        started = true
        let states = await api.session.states()
        observation = Task { [weak self] in
            for await state in states {
                guard let self, !Task.isCancelled else { return }
                self.received(state)
            }
        }
        let events = await api.updates()
        updates = Task { [weak self] in
            for await _ in events {
                guard let self, !Task.isCancelled else { return }
                await self.reloadPending()
                if !self.refreshing { await self.commercial?.load(force: true) }
            }
        }
        monitor.pathUpdateHandler = { [weak self] path in
            let available = path.status == .satisfied
            Task { @MainActor [weak self] in
                guard let self else { return }
                let wasOffline = self.offline
                self.offline = !available
                await self.api.setConnected(available)
                if available && wasOffline { await self.refresh() }
            }
        }
        monitor.start(queue: DispatchQueue(label: "paris.venio.reachability"))
        do { try await api.session.restore() }
        catch { errorKey = mobileErrorKey(error) }
        starting = false
    }
    private func received(_ state: SessionState) {
        let previous = self.state
        self.state = state
        switch state {
        case .signedOut:
            refreshID = nil
            refreshing = false
            connectionTask?.cancel()
            lastPreferences = nil
            commercial = nil
            pending = []
            preferenceWrite?.cancel()
            if case .signedIn = previous { onDisconnect?() }
        case .signedIn(let user, _):
            let store = CommercialStore(api: api, clock: DemoClock(now: .now))
            commercial = store
            connectionTask = Task {
                await loadPreferences(userID: user.id)
                guard !Task.isCancelled else { return }
                await refresh()
                await store.load()
            }
        }
    }
    public func refresh() async {
        guard case .signedIn = state, let expected = commercial, !refreshing else { return }
        let id = UUID()
        refreshID = id
        refreshing = true
        defer { if refreshID == id { refreshing = false; refreshID = nil } }
        errorKey = nil
        do { try await api.refresh() }
        catch {
            guard commercial === expected else { return }
            if let network = error as? URLError { if network.code != .cancelled { offline = true } }
            else { errorKey = mobileErrorKey(error) }
        }
        guard commercial === expected else { return }
        await reloadPending()
        await expected.load(force: true)
    }
    @discardableResult public func reloadPending() async -> Bool {
        guard case .signedIn = state else { pending = []; return true }
        do { pending = try await api.store.writes(scope: api.session.identity()); return true }
        catch { errorKey = mobileErrorKey(error); return false }
    }
    public func retry(_ id: UUID) async {
        do { try await api.outbox.retry(id: id); await refresh() }
        catch { errorKey = mobileErrorKey(error) }
        await reloadPending()
    }
    public func delete(_ id: UUID) async {
        do { try await api.outbox.delete(id: id); await commercial?.load(force: true) }
        catch { errorKey = mobileErrorKey(error) }
        await reloadPending()
    }
    public func logout() async {
        discardAdditionalPending?()
        do { try await api.session.logout() }
        catch { errorKey = mobileErrorKey(error) }
    }
    public func preferenceChanged(_ selection: ThemeSelection) {
        guard case .signedIn(let user, _) = state else { return }
        let value = MobilePreferences(theme: selection.theme.rawValue, background: selection.background, accent: selection.accent, locale: selection.locale)
        guard value != lastPreferences else { return }
        lastPreferences = value
        let key = pendingPreferenceKey(user.id)
        if let data = try? JSONEncoder().encode(value) { UserDefaults.standard.set(data, forKey: key) }
        let auth = api.session
        let previous = preferenceWrite
        preferenceWrite = Task { [weak self] in
            guard let scope = try? await auth.identity(), scope.user.id == user.id else { return }
            await previous?.value
            guard let self, !Task.isCancelled, case .signedIn(let current, _) = self.state, current.id == user.id else { return }
            do {
                try await self.api.savePreferences(value, scope: scope)
                if let data = UserDefaults.standard.data(forKey: key), (try? JSONDecoder().decode(MobilePreferences.self, from: data)) == value {
                    UserDefaults.standard.removeObject(forKey: key)
                }
            } catch { return }
        }
    }
    private func pendingPreferenceKey(_ userID: String) -> String { "venio.preferences.pending." + userID }
    private func loadPreferences(userID: String) async {
        do {
            let scope = try await api.session.identity()
            guard scope.user.id == userID else { return }
            let key = pendingPreferenceKey(userID)
            if let data = UserDefaults.standard.data(forKey: key), let pending = try? JSONDecoder().decode(MobilePreferences.self, from: data) {
                try await api.savePreferences(pending, scope: scope)
                UserDefaults.standard.removeObject(forKey: key)
            }
            let value = try await api.preferences(scope: scope)
            guard case .signedIn(let current, _) = state, current.id == userID, let theme = ThemeKind(rawValue: value.theme) else { return }
            lastPreferences = value
            themes.select(ThemeSelection(theme: theme, background: value.background, accent: value.accent, locale: value.locale, autoTranslate: themes.selection.autoTranslate))
        } catch { return }
    }
}
#endif

public func mobileErrorKey(_ error: any Error) -> String {
    if let error = error as? LoginFailure {
        switch error {
        case .credentials: return "Identifiants invalides"
        case .secondFactor: return "Code de vérification invalide"
        case .disabled: return "Votre accès a été désactivé"
        case .roleNotAllowed: return "L’app est réservée à l’équipe Venio"
        case .mfaSetupRequired: return "Configurez la double authentification sur le web"
        case .rateLimited: return "Trop de tentatives. Réessayez plus tard."
        case .validation: return "Vérifiez les champs saisis"
        }
    }
    if let error = error as? HTTPFailure {
        if error.code == "BROWSER_SESSION_REQUIRED" || error.code == "MFA_STEP_UP_REQUIRED" { return "Disponible sur le web" }
        if error.status == 429 { return "Trop de tentatives. Réessayez plus tard." }
    }
    if let error = error as? VenioAPIError {
        if error.code == "RATE_LIMITED" { return "Trop de tentatives. Réessayez plus tard." }
        if error.code == "PENDING_WRITES_OTHER_ACCOUNT" { return "Reconnectez-vous au compte précédent pour envoyer ou supprimer ses modifications en attente." }
        if error.code == "CONNECTION_REQUIRED" { return "Connexion requise" }
        if error.code == "SIGNED_OUT" { return "Veuillez vous reconnecter" }
    }
    if error is URLError { return "Connexion requise" }
    return "Opération impossible. Réessayez."
}
