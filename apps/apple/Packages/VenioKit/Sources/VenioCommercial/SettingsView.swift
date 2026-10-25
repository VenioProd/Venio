#if !os(watchOS)
import SwiftUI
import VenioTheme

public struct SettingsView: View {
    @Environment(\.locale) private var locale
    @Environment(\.venioSession) private var session
    @State private var showingLogout = false
    public init() {}
    public var body: some View {
        List {
            AppLockSetting()
            NavigationLink { MessageTemplatesSettings() } label: {
                Label { VText("Modèles de messages") } icon: { Image(systemName: "text.bubble") }
            }
            NavigationLink { AppearanceView() } label: {
                Label { VText("Apparence") } icon: { Image(systemName: "paintpalette").accessibilityHidden(true) }
            }
            NavigationLink { LanguageView() } label: {
                Label { VText("Langue") } icon: { Image(systemName: "globe").accessibilityHidden(true) }
            }
            if let session {
                NavigationLink { DevicesView(session: session) } label: {
                    Label { VText("Appareils connectés") } icon: { Image(systemName: "desktopcomputer.and.iphone") }
                }
                NavigationLink { OutboxView(session: session) } label: { VText("Modifications en attente") }
                Button(role: .destructive) {
                    Task {
                        guard await session.reloadPending() else { return }
                        if session.pendingModificationCount == 0 { await session.logout() }
                        else { showingLogout = true }
                    }
                } label: { VText("Se déconnecter") }
            }
        }
        .confirmationDialog(CommercialStrings.text("Confirmer la déconnexion", locale: locale), isPresented: $showingLogout, titleVisibility: .visible) {
            Button(role: .destructive) { Task { await session?.logout() } } label: { VText("Se déconnecter") }
        } message: {
            Text(verbatim: CommercialStrings.format("%lld modifications non envoyées seront perdues", locale: locale, session?.pendingModificationCount ?? 0))
        }
        .scrollContentBackground(.hidden)
        .background { ThemedBackground() }
        .navigationTitle(CommercialStrings.text("Réglages", locale: locale))
    }
}

public struct LanguageView: View {
    @Environment(ThemeManager.self) private var preferences
    @Environment(\.locale) private var locale
    public init() {}
    public var body: some View {
        CommercialPage {
            VStack(alignment: .leading, spacing: 20) {
                Picker(CommercialStrings.text("Langue de l’interface", locale: locale), selection: Binding(get: {
                    preferences.selection.locale
                }, set: { update(locale: $0, autoTranslate: preferences.selection.autoTranslate) })) {
                    VText("Système").tag("system")
                    VText("Français").tag("fr")
                    VText("English").tag("en")
                }.pickerStyle(.inline)
                Toggle(isOn: Binding(get: { preferences.selection.autoTranslate }, set: {
                    update(locale: preferences.selection.locale, autoTranslate: $0)
                })) { VText("Traduire automatiquement") }
                VText("Les notes, messages et mises à jour écrits dans l’autre langue s’affichent traduits. La traduction se fait sur l’appareil.").font(.subheadline)
            }.venioCard()
            VStack(alignment: .leading, spacing: 12) {
                VText("Aperçu en direct").font(.headline)
                TranslatableText("The client would like to review the proposal next week.")
            }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
        }.navigationTitle(CommercialStrings.text("Langue", locale: locale))
    }
    private func update(locale: String, autoTranslate: Bool) {
        let selection = preferences.selection
        preferences.select(ThemeSelection(theme: selection.theme, background: selection.background, accent: selection.accent,
                                          locale: locale, autoTranslate: autoTranslate))
    }
}
#endif
