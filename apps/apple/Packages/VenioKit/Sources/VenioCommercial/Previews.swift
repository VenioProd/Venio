import SwiftUI
import VenioCore
import VenioTheme

private struct CommercialPreview<Content: View>: View {
    @State private var store = CommercialStore(api: MockVenioAPI())
    @State private var theme: ThemeManager
    let content: Content
    init(_ kind: ThemeKind, @ViewBuilder content: () -> Content) {
        let theme = ThemeManager()
        theme.select(ThemeSelection(theme: kind, background: kind.backgrounds[0], accent: kind.accents[0]))
        _theme = State(initialValue: theme)
        self.content = content()
    }
    var body: some View {
        ThemeHost(manager: theme) {
            if store.hasLoaded { content.environment(store) }
            else { ProgressView().task { await store.load() } }
        }
    }
}

#if !os(watchOS)
#Preview("Aujourd’hui · Glass") { CommercialPreview(.glass) { NavigationStack { TodayView() } } }
#Preview("Aujourd’hui · Néon") { CommercialPreview(.neon) { NavigationStack { TodayView() } } }
#Preview("Pipeline · Glass") { CommercialPreview(.glass) { NavigationStack { PipelineView() } } }
#Preview("Pipeline · Néon") { CommercialPreview(.neon) { NavigationStack { PipelineView() } } }
#Preview("Lead · Glass") { CommercialPreview(.glass) { NavigationStack { LeadDetailView(id: "lead-calder") } } }
#Preview("Lead · Néon") { CommercialPreview(.neon) { NavigationStack { LeadDetailView(id: "lead-calder") } } }
#Preview("Projets · Glass") { CommercialPreview(.glass) { NavigationStack { ProjectsView() } } }
#Preview("Projets · Néon") { CommercialPreview(.neon) { NavigationStack { ProjectsView() } } }
#Preview("Projet · Glass") { CommercialPreview(.glass) { NavigationStack { ProjectDetailView(id: "project-pilote") } } }
#Preview("Projet · Néon") { CommercialPreview(.neon) { NavigationStack { ProjectDetailView(id: "project-pilote") } } }
#Preview("Réglages · Glass") { CommercialPreview(.glass) { NavigationStack { SettingsView() } } }
#Preview("Réglages · Néon") { CommercialPreview(.neon) { NavigationStack { SettingsView() } } }
#Preview("Apparence · Glass") { CommercialPreview(.glass) { NavigationStack { AppearanceView() } } }
#Preview("Apparence · Néon") { CommercialPreview(.neon) { NavigationStack { AppearanceView() } } }
#Preview("Langue · Glass") { CommercialPreview(.glass) { NavigationStack { LanguageView() } } }
#Preview("Langue · Néon") { CommercialPreview(.neon) { NavigationStack { LanguageView() } } }
#Preview("Administration · Glass") { CommercialPreview(.glass) { AdminPlaceholderView() } }
#Preview("Administration · Néon") { CommercialPreview(.neon) { AdminPlaceholderView() } }
#Preview("Racine · Glass") { CommercialPreview(.glass) { RootView(api: MockVenioAPI()) } }
#Preview("Racine · Néon") { CommercialPreview(.neon) { RootView(api: MockVenioAPI()) } }
#endif
#Preview("Relances · Glass") { CommercialPreview(.glass) { FollowUpsView(api: MockVenioAPI()) } }
#Preview("Relances · Néon") { CommercialPreview(.neon) { FollowUpsView(api: MockVenioAPI()) } }
#Preview("Appel · Glass") { CommercialPreview(.glass) { WatchLeadDetailView(id: "lead-calder") } }
#Preview("Appel · Néon") { CommercialPreview(.neon) { WatchLeadDetailView(id: "lead-calder") } }
