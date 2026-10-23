#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

public enum CommercialTab: String, CaseIterable, Identifiable {
    case today, pipeline, projects, settings
    public var id: Self { self }
    var title: String {
        switch self {
        case .today: "Aujourd’hui"
        case .pipeline: "Pipeline"
        case .projects: "Projets"
        case .settings: "Réglages"
        }
    }
    var icon: String {
        switch self {
        case .today: "sun.max"
        case .pipeline: "chart.bar.xaxis"
        case .projects: "folder"
        case .settings: "gearshape"
        }
    }
}

public struct CommercialSpace: View {
    @State private var tab: CommercialTab
    @State private var todayPath: [String]
    @State private var pipelinePath: [String]

    public init(initialTab: CommercialTab = .today, initialLeadID: String? = nil) {
        _tab = State(initialValue: initialLeadID == nil ? initialTab : .pipeline)
        _todayPath = State(initialValue: [])
        _pipelinePath = State(initialValue: initialLeadID.map { [$0] } ?? [])
    }

    public var body: some View {
        TabView(selection: $tab) {
            NavigationStack(path: $todayPath) {
                TodayView { todayPath.append($0) }
                    .navigationDestination(for: String.self) { LeadDetailView(id: $0) }
            }.tabItem { tabLabel(.today) }.tag(CommercialTab.today)
            NavigationStack(path: $pipelinePath) {
                PipelineView { pipelinePath.append($0) }
                    .navigationDestination(for: String.self) { LeadDetailView(id: $0) }
            }.tabItem { tabLabel(.pipeline) }.tag(CommercialTab.pipeline)
            ProjectsTab()
                .tabItem { tabLabel(.projects) }.tag(CommercialTab.projects)
            NavigationStack { SettingsView() }
                .tabItem { tabLabel(.settings) }.tag(CommercialTab.settings)
        }
        .tabViewStyle(.sidebarAdaptable)
    }

    private func tabLabel(_ item: CommercialTab) -> some View {
        Label { VText(item.title) } icon: { Image(systemName: item.icon).accessibilityHidden(true) }
    }
}

public struct AdminPlaceholderView: View {
    public init() {}
    public var body: some View {
        VText("Espace administration").font(.title)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background { ThemedBackground() }
    }
}
#endif
