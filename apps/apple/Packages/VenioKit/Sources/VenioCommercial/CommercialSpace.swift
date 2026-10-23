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
    @Environment(\.locale) private var locale
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
    #endif
    @State private var tab: CommercialTab
    @State private var sidebar: CommercialTab?
    @State private var todayPath: [String]
    @State private var pipelinePath: [String]
    @State private var projectPath: [String] = []
    @State private var leadID: String?
    @State private var projectID: String?

    public init(initialTab: CommercialTab = .today, initialLeadID: String? = nil) {
        let selected = initialLeadID != nil && initialTab != .today && initialTab != .pipeline ? .pipeline : initialTab
        _tab = State(initialValue: selected)
        _sidebar = State(initialValue: selected)
        _todayPath = State(initialValue: selected == .today ? initialLeadID.map { [$0] } ?? [] : [])
        _pipelinePath = State(initialValue: selected == .pipeline ? initialLeadID.map { [$0] } ?? [] : [])
        _leadID = State(initialValue: initialLeadID)
    }

    public var body: some View {
        #if os(iOS)
        if sizeClass == .compact { tabs } else { split }
        #else
        split
        #endif
    }

    private var tabs: some View {
        TabView(selection: $tab) {
            NavigationStack(path: $todayPath) {
                TodayView { todayPath.append($0) }
                    .navigationDestination(for: String.self) { LeadDetailView(id: $0) }
            }.tabItem { tabLabel(.today) }.tag(CommercialTab.today)
            NavigationStack(path: $pipelinePath) {
                PipelineView { pipelinePath.append($0) }
                    .navigationDestination(for: String.self) { LeadDetailView(id: $0) }
            }.tabItem { tabLabel(.pipeline) }.tag(CommercialTab.pipeline)
            NavigationStack(path: $projectPath) {
                ProjectsView { projectPath.append($0) }
                    .navigationDestination(for: String.self) { ProjectDetailView(id: $0) }
            }.tabItem { tabLabel(.projects) }.tag(CommercialTab.projects)
            NavigationStack { SettingsView() }
                .tabItem { tabLabel(.settings) }.tag(CommercialTab.settings)
        }
    }

    private var split: some View {
        NavigationSplitView {
            List(CommercialTab.allCases, selection: $sidebar) { item in tabLabel(item).tag(item) }
                .navigationTitle(CommercialStrings.text("Venio", locale: locale))
                .scrollContentBackground(.hidden)
                .background { ThemedBackground() }
        } content: {
            switch sidebar ?? .today {
            case .today: TodayView { leadID = $0; projectID = nil }
            case .pipeline: PipelineView { leadID = $0; projectID = nil }
            case .projects: ProjectsView { projectID = $0; leadID = nil }
            case .settings: SettingsView()
            }
        } detail: {
            if let leadID { LeadDetailView(id: leadID) }
            else if let projectID { ProjectDetailView(id: projectID) }
            else {
                ContentUnavailableView(CommercialStrings.text("Sélectionnez une fiche", locale: locale), systemImage: "sidebar.right")
                    .background { ThemedBackground() }
            }
        }
        .onChange(of: sidebar) { _, _ in leadID = nil; projectID = nil }
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
