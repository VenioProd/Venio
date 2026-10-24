#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

private struct SessionEnvironmentKey: EnvironmentKey { static let defaultValue: SessionModel? = nil }
extension EnvironmentValues {
    var venioSession: SessionModel? {
        get { self[SessionEnvironmentKey.self] }
        set { self[SessionEnvironmentKey.self] = newValue }
    }
}

public struct SessionRootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(ThemeManager.self) private var themes
    @State private var session: SessionModel
    private let initialTab: CommercialTab
    private let initialLeadID: String?
    public init(session: SessionModel, initialTab: CommercialTab = .today, initialLeadID: String? = nil) {
        _session = State(initialValue: session)
        self.initialTab = initialTab; self.initialLeadID = initialLeadID
    }
    public var body: some View {
        Group {
            if session.starting { ProgressView { VText("Chargement") } }
            else if let store = session.commercial {
                RootView(store: store, initialTab: initialTab, initialLeadID: initialLeadID)
                    .refreshable { await session.refresh() }
            } else { LoginView(session: session) }
        }
        .overlay(alignment: .top) {
            if session.commercial != nil, let key = session.errorKey { MobileErrorView(key: key).padding().venioCard() }
        }
        .environment(\.venioSession, session)
        .background { ThemedBackground() }
        .task { await session.start() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await session.refresh() } } }
        .onChange(of: themes.selection) { _, selection in session.preferenceChanged(selection) }
    }
}

struct MobileErrorView: View {
    @Environment(\.openURL) private var openURL
    @Environment(\.venioPalette) private var palette
    let key: String
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VText(key).foregroundStyle(palette.urgent.color)
            if ["Disponible sur le web", "Configurez la double authentification sur le web"].contains(key) {
                Button { openURL(URL(string: "https://venio.paris/admin")!) } label: { VText("Ouvrir le site web") }
            }
        }
    }
}

private struct LoginView: View {
    @Environment(\.locale) private var locale
    let session: SessionModel
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var recovery = false
    @State private var secondFactor = false
    @State private var busy = false
    @State private var errorKey: String?
    var body: some View {
        NavigationStack {
            CommercialPage {
                VStack(alignment: .leading, spacing: 18) {
                    VText("Connexion à Venio").font(.largeTitle.bold())
                    if secondFactor {
                        VText("Double authentification").font(.headline)
                        TextField(CommercialStrings.text(recovery ? "Code de secours" : "Code de vérification", locale: locale), text: $code)
                            .textContentType(.oneTimeCode).textFieldStyle(.roundedBorder)
                        Toggle(isOn: $recovery) { VText("Utiliser un code de secours") }
                            .onChange(of: recovery) { _, _ in code = "" }
                        Button { secondFactor = false; code = ""; errorKey = nil } label: { VText("Retour") }
                    } else {
                        TextField(CommercialStrings.text("E-mail", locale: locale), text: $email)
                            .textContentType(.username).textFieldStyle(.roundedBorder)
                            #if os(iOS)
                            .textInputAutocapitalization(.never).keyboardType(.emailAddress).autocorrectionDisabled()
                            #endif
                        SecureField(CommercialStrings.text("Mot de passe", locale: locale), text: $password)
                            .textContentType(.password).textFieldStyle(.roundedBorder)
                    }
                    if let key = errorKey ?? session.errorKey { MobileErrorView(key: key) }
                    Button { login() } label: {
                        HStack { if busy { ProgressView() }; VText("Se connecter") }
                    }.venioPrimaryButton()
                        .disabled(email.isEmpty || password.isEmpty || (secondFactor && code.isEmpty))
                }.frame(maxWidth: 440).venioCard().disabled(busy)
            }
        }
    }
    private func login() {
        guard !busy else { return }
        busy = true; errorKey = nil
        Task { @MainActor in
            defer { busy = false }
            do {
                let outcome = try await session.api.session.login(email: email, password: password,
                    totpCode: secondFactor && !recovery ? code : nil, recoveryCode: secondFactor && recovery ? code : nil)
                switch outcome {
                case .requiresSecondFactor: secondFactor = true
                case .signedIn: password = ""; code = ""
                }
            } catch { errorKey = mobileErrorKey(error) }
        }
    }
}

struct OutboxStatusView: View {
    @Environment(\.venioSession) private var session
    @Environment(\.locale) private var locale
    @State private var showing = false
    var body: some View {
        if let session, session.offline || !session.pending.isEmpty {
            Button { showing = true } label: {
                HStack {
                    Image(systemName: session.offline ? "wifi.slash" : "arrow.triangle.2.circlepath")
                    Text(verbatim: CommercialStrings.format(session.offline ? "Hors ligne · %lld modifications en attente" : "%lld modifications en attente", locale: locale, session.pending.count))
                }.font(.caption).padding(8)
            }
            .sheet(isPresented: $showing) {
                NavigationStack {
                    OutboxView(session: session).toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button { showing = false } label: { VText("Fermer") } }
                    }
                }
            }
        }
    }
}

struct OutboxView: View {
    @Environment(\.locale) private var locale
    @State private var busy = false
    let session: SessionModel
    var body: some View {
        List {
            ForEach(session.pending) { write in
                VStack(alignment: .leading, spacing: 10) {
                    VText(write.type == "interaction" ? "Interaction" : "Modification du lead").font(.headline)
                    Text(verbatim: CommercialFormats(locale: locale).timestamp(write.createdAt)).font(.caption)
                    VText(write.state == "failed" ? "Échec de l’envoi" : "En attente")
                    if write.state == "failed" {
                        if write.lastError == "BROWSER_SESSION_REQUIRED" { MobileErrorView(key: "Disponible sur le web") }
                        else if write.lastError == "UNCERTAIN_WRITE" { VText("Résultat incertain : vérifiez la fiche avant de réessayer").font(.caption) }
                        else { VText("Le serveur a refusé cette modification.").font(.caption) }
                        HStack {
                            Button { perform { await session.retry(write.id) } } label: { VText("Réessayer") }
                            Button(role: .destructive) { perform { await session.delete(write.id) } } label: { VText("Supprimer") }
                        }
                    }
                }
            }
            if session.pending.isEmpty { VText("Aucune modification en attente") }
            if let key = session.errorKey { MobileErrorView(key: key) }
        }
        .disabled(busy)
        .navigationTitle(CommercialStrings.text("Modifications en attente", locale: locale))
        .task { await session.reloadPending() }
    }
    private func perform(_ action: @escaping @MainActor () async -> Void) {
        busy = true
        Task { await action(); busy = false }
    }
}

struct DevicesView: View {
    @Environment(\.locale) private var locale
    let session: SessionModel
    @State private var devices: [Device] = []
    @State private var busy = false
    @State private var errorKey: String?
    @State private var currentToRevoke: Device?
    var body: some View {
        List {
            ForEach(devices) { device in
                VStack(alignment: .leading, spacing: 8) {
                    Text(verbatim: device.name).font(.headline)
                    Text(verbatim: device.model + " · " + device.osVersion).font(.caption)
                    if device.current { VText("Cet appareil").font(.caption) }
                    Button(role: .destructive) {
                        if device.current { Task { if await session.reloadPending() { currentToRevoke = device } } }
                        else { revoke(device) }
                    } label: { VText("Révoquer") }
                }
            }
            Button(role: .destructive) {
                perform { try await session.api.session.revokeAllOtherDevices(); devices = try await session.api.session.devices() }
            } label: { VText("Déconnecter les autres appareils") }
            if let errorKey { MobileErrorView(key: errorKey) }
        }
        .disabled(busy)
        .navigationTitle(CommercialStrings.text("Appareils connectés", locale: locale))
        .task { perform { devices = try await session.api.session.devices() } }
        .confirmationDialog(CommercialStrings.text("Révoquer cet appareil ?", locale: locale), isPresented: Binding(get: { currentToRevoke != nil }, set: { if !$0 { currentToRevoke = nil } }), titleVisibility: .visible) {
            Button(role: .destructive) { if let device = currentToRevoke { revoke(device); currentToRevoke = nil } } label: { VText("Se déconnecter") }
        } message: {
            Text(verbatim: CommercialStrings.format("%lld modifications non envoyées seront perdues", locale: locale, session.pendingModificationCount))
        }
    }
    private func revoke(_ device: Device) {
        perform {
            try await session.api.session.revokeDevice(id: device.id)
            if device.current { session.discardAdditionalPending?() }
            else { devices = try await session.api.session.devices() }
        }
    }
    private func perform(_ action: @escaping @MainActor () async throws -> Void) {
        busy = true; errorKey = nil
        Task { @MainActor in
            defer { busy = false }
            do { try await action() } catch { errorKey = mobileErrorKey(error) }
        }
    }
}
#endif
