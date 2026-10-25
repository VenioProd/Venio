#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

public enum CommercialTab: String, CaseIterable, Identifiable {
    case today, pipeline, projects, quotes, figures
    public var id: Self { self }
    var title: String {
        switch self {
        case .today: "Aujourd’hui"
        case .pipeline: "Pipeline"
        case .projects: "Projets"
        case .quotes: "Devis"
        case .figures: "Chiffres"
        }
    }
    var icon: String {
        switch self {
        case .today: "sun.max"
        case .pipeline: "chart.bar.xaxis"
        case .projects: "folder"
        case .quotes: "doc.text"
        case .figures: "chart.xyaxis.line"
        }
    }
}

public struct CommercialSpace: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.locale) private var locale
    @State private var showingNewLead = false
    @State private var searchDestination: DeepLink?
    private let initialProjectID: String?
    @State private var tab: CommercialTab
    @State private var todayPath: [String]
    @State private var pipelinePath: [String]
    @Namespace private var pipelineTransition

    public init(initialTab: CommercialTab = .today, initialLeadID: String? = nil, initialProjectID: String? = nil) {
        self.initialProjectID = initialProjectID
        _tab = State(initialValue: initialProjectID != nil ? .projects : initialLeadID == nil ? initialTab : .pipeline)
        _todayPath = State(initialValue: [])
        _pipelinePath = State(initialValue: initialLeadID.map { [$0] } ?? [])
    }

    public var body: some View {
        TabView(selection: $tab) {
            NavigationStack(path: $todayPath) {
                TodayView { todayPath.append($0) }
                    .navigationDestination(for: String.self) { LeadDetailView(id: $0) }
            }.tabItem { tabLabel(.today) }.tag(CommercialTab.today)
            if store.currentUser?.permissions.contains("view_crm") == true {
                NavigationStack(path: $pipelinePath) {
                    PipelineView(transitionNamespace: pipelineTransition) { pipelinePath.append($0) }
                        .navigationDestination(for: String.self) { id in
                            LeadDetailView(id: id)
                                #if os(iOS)
                                .navigationTransition(.zoom(sourceID: id, in: pipelineTransition))
                                #endif
                        }
                }.tabItem { tabLabel(.pipeline) }.tag(CommercialTab.pipeline)
            }
            if store.currentUser?.permissions.contains("view_projects") == true {
                ProjectsTab(initialProjectID: initialProjectID).tabItem { tabLabel(.projects) }.tag(CommercialTab.projects)
            }
            if store.canManageQuotes {
                NavigationStack { QuotesView() }.tabItem { tabLabel(.quotes) }.tag(CommercialTab.quotes)
            }
            if store.canViewFigures {
                NavigationStack { SalesFiguresView() }.tabItem { tabLabel(.figures) }.tag(CommercialTab.figures)
            }
        }
        #if os(iOS)
        .sensoryFeedback(.success, trigger: store.successFeedback)
        .sensoryFeedback(.error, trigger: store.errorFeedback)
        #endif
        .tabViewStyle(.sidebarAdaptable)
        #if os(iOS)
        // La maquette iPad garde la barre d'onglets en haut, même en paysage, pour laisser toute la largeur au kanban.
        .defaultAdaptableTabBarPlacement(.tabBar)
        #endif
        .quickEntry(isEnabled: store.currentUser?.permissions.contains("manage_crm") == true) {
            HStack {
                OutboxStatusView()
                Button { showingNewLead = true } label: {
                    Label { VText("Saisie rapide") } icon: { Image(systemName: "plus") }
                }.frame(maxWidth: .infinity).accessibilityIdentifier("quickEntry.open")
            }
        }
        .background {
            Button { store.showingSearch = true } label: { VText("Rechercher") }
                .keyboardShortcut("k", modifiers: .command)
                .frame(width: 0, height: 0).opacity(0).accessibilityHidden(true)
        }
        .sheet(isPresented: Binding(get: { store.showingSearch }, set: { store.showingSearch = $0 }), onDismiss: {
            if let destination = searchDestination {
                searchDestination = nil
                Task { await store.open(destination) }
            }
        }) {
            GlobalSearchView { link in searchDestination = link; store.showingSearch = false }
        }
        .sheet(isPresented: $showingNewLead) {
            NewLeadView { id in tab = .pipeline; pipelinePath = [id] }
        }
        .sheet(isPresented: Binding(get: { store.destination != nil }, set: { if !$0 { store.destination = nil } })) {
            if let destination = store.destination { NotificationDestinationView(destination: destination) }
        }
        .alert(CommercialStrings.text("Destination indisponible", locale: locale), isPresented: Binding(get: { store.routeFailed }, set: { store.routeFailed = $0 })) {
            Button { store.routeFailed = false } label: { VText("Fermer") }
        } message: { VText("La notification ne permet pas d’identifier cette fiche, ou vous n’y avez plus accès.") }
        #if os(iOS)
        .sheet(item: Binding(get: { store.callPrompt }, set: { store.callPrompt = $0 })) { CallLogView(call: $0) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { store.leftApplication() }
            if phase == .active { store.returnedToApplication() }
        }
        #endif
        .onAppear {
            if tab == .quotes && !store.canManageQuotes { tab = .today }
            if tab == .figures && !store.canViewFigures { tab = .today }
            if tab == .pipeline && store.currentUser?.permissions.contains("view_crm") != true { tab = .today }
            if tab == .projects && store.currentUser?.permissions.contains("view_projects") != true { tab = .today }
        }
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

private extension View {
    /// Accessoire de la barre d'onglets sur iOS, bouton de barre d'outils sur Mac.
    @ViewBuilder func quickEntry(isEnabled: Bool, @ViewBuilder content: () -> some View) -> some View {
        #if os(iOS)
        tabViewBottomAccessory(isEnabled: isEnabled, content: content)
        #else
        toolbar { if isEnabled { ToolbarItem(placement: .primaryAction) { content() } } }
        #endif
    }
}
#endif
