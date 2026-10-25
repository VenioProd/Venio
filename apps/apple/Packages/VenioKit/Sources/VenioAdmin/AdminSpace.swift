#if !os(watchOS)
import SwiftUI
import VenioTheme
#if os(iOS)
import UIKit
#endif

public struct AdminSpace<Settings: View>: View {
    @Environment(AdminStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.scenePhase) private var scenePhase
    @State private var section: AdminSection?
    @State private var projectID: String?
    @State private var conversationID: String?
    @State private var ticketID: String?
    @State private var issueID: String?
    @State private var phonePath: NavigationPath
    @State private var showingSettings = false
    private let settings: Settings

    public init(initialSection: AdminSection? = nil, initialItemID: String? = nil, @ViewBuilder settings: () -> Settings) {
        let launchSection = initialSection ?? (initialItemID == nil ? nil : .projects)
        _section = State(initialValue: launchSection)
        _projectID = State(initialValue: launchSection == .projects ? initialItemID : nil)
        _conversationID = State(initialValue: launchSection == .messaging ? initialItemID : nil)
        _ticketID = State(initialValue: launchSection == .tickets ? initialItemID : nil)
        _issueID = State(initialValue: launchSection == .dev ? initialItemID : nil)
        var path = NavigationPath()
        if let launchSection {
            path.append(launchSection)
            if launchSection.hasDetail, let initialItemID { path.append(initialItemID) }
        }
        _phonePath = State(initialValue: path)
        self.settings = settings()
    }
    private var phone: Bool {
        #if os(iOS)
        UIDevice.current.userInterfaceIdiom == .phone
        #else
        false
        #endif
    }
    /// Sur iOS, la capture du sélecteur d'apps est prise dès que la scène devient inactive.
    private var hidesContent: Bool {
        #if os(iOS)
        scenePhase != .active
        #else
        false
        #endif
    }
    private var privacyMask: some View {
        ZStack {
            ThemedBackground()
            Label { AdminText("Contenu masqué") } icon: { Image(systemName: "lock.fill").accessibilityHidden(true) }.font(.headline)
        }
    }
    private var current: AdminSection { section ?? store.availableSections.first ?? .activity }
    public var body: some View {
        Group {
            if phone { phoneNavigation }
            else if current.hasDetail {
                NavigationSplitView {
                    sidebar.navigationSplitViewColumnWidth(min: 190, ideal: 220, max: 260)
                } content: {
                    sectionList(current).navigationSplitViewColumnWidth(min: 250, ideal: 300, max: 380)
                } detail: { detail(current) }
            } else {
                NavigationSplitView {
                    sidebar.navigationSplitViewColumnWidth(min: 190, ideal: 220, max: 260)
                } detail: { sectionList(current) }
            }
        }
        .environment(\.adminReadOnly, phone)
        .background { ThemedBackground() }
        .overlay { if hidesContent { privacyMask } }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button { Task { await refreshCurrent() } } label: {
                    Label { AdminText("Actualiser") } icon: { Image(systemName: "arrow.clockwise").accessibilityHidden(true) }
                }.keyboardShortcut("r", modifiers: .command)
                    .disabled(store.inFlight.contains(.load(current)))
                Button { showingSettings = true } label: {
                    Label { AdminText("Réglages") } icon: { Image(systemName: "gearshape").accessibilityHidden(true) }
                }
            }
        }
        .background { shortcuts }
        .sheet(isPresented: $showingSettings) {
            NavigationStack {
                settings.toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button { showingSettings = false } label: { AdminText("Fermer") }
                    }
                }
            }.frame(minWidth: 320, idealWidth: 520, minHeight: 400)
        }
        .task {
            if !store.availableSections.contains(current) {
                section = store.availableSections.first
                phonePath = NavigationPath()
            }
            for item in [AdminSection.projects, .messaging, .tickets, .dev] where store.availableSections.contains(item) {
                if store.state(for: item) == .idle { await store.refresh(item) }
            }
            if store.user.permissions.contains("view_change_requests") { await store.loadChangeRequests() }
        }
        .task(id: current) { if !phone { await store.refresh(current) } }
    }
    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading) {
                AdminText("Venio").font(.largeTitle.bold())
                AdminText("Espace admin").font(.subheadline)
            }.padding()
            List(selection: Binding(get: { Optional(current) }, set: { section = $0 })) {
                ForEach(store.availableSections, id: \.self) { item in
                    sectionLabel(item).tag(item)
                }
            }.scrollContentBackground(.hidden)
            HStack {
                Text(verbatim: store.user.initials).font(.headline).padding(10).venioCard()
                Text(verbatim: store.user.name).font(.subheadline.bold())
            }.padding()
        }.background { ThemedBackground() }
    }
    private var phoneNavigation: some View {
        NavigationStack(path: $phonePath) {
            List(store.availableSections, id: \.self) { item in
                NavigationLink(value: item) { sectionLabel(item) }
            }
            .navigationTitle(AdminStrings.text("Espace admin", locale: locale))
            .navigationDestination(for: AdminSection.self) { item in
                sectionList(item)
                    .task { section = item; await store.refresh(item) }
                    .refreshable { await store.refresh(item) }
            }
            .navigationDestination(for: String.self) { id in phoneDetail(current, id: id) }
        }
    }
    private func sectionLabel(_ item: AdminSection) -> some View {
        HStack {
            Label { AdminText(item.title) } icon: { Image(systemName: item.icon).accessibilityHidden(true) }
            Spacer()
            if let count = store.badge(for: item), count > 0 {
                Text(count, format: .number).font(.caption.bold().monospacedDigit())
            }
        }
    }
    @ViewBuilder private func sectionList(_ item: AdminSection) -> some View {
        Group {
            switch item {
            case .business: AdminBusinessView { section = $0; if phone { phonePath.append($0) } }
            case .projects: AdminProjectsView(selection: $projectID)
            case .messaging: AdminConversationsView(selection: $conversationID)
            case .activity: AdminActivityView()
            case .tickets: AdminTicketsView(selection: $ticketID)
            case .dev: AdminDevView(selection: $issueID)
            }
        }.navigationTitle(AdminStrings.text(item.title, locale: locale))
            .inlineNavigationTitle()
            .refreshable { await refreshCurrent() }
    }
    @ViewBuilder private func detail(_ item: AdminSection) -> some View {
        switch item {
        case .projects:
            if let projectID { AdminProjectView(id: projectID).id(projectID) }
            else { AdminEmptyView(title: "Sélectionnez un projet", icon: "folder") }
        case .messaging:
            if let conversationID { AdminMessagesView(id: conversationID).id(conversationID) }
            else { AdminEmptyView(title: "Sélectionnez une conversation", icon: "bubble.left") }
        case .tickets:
            if let ticketID { AdminTicketView(id: ticketID).id(ticketID) }
            else { AdminEmptyView(title: "Sélectionnez un ticket", icon: "ticket") }
        case .dev:
            if let issueID { AdminDevDetailView(id: issueID).id(issueID) }
            else { AdminEmptyView(title: "Sélectionnez une issue", icon: "chevron.left.forwardslash.chevron.right") }
        default: EmptyView()
        }
    }
    private func phoneDetail(_ item: AdminSection, id: String) -> some View {
        Group {
            switch item {
            case .projects: AdminProjectView(id: id).id(id)
            case .messaging: AdminMessagesView(id: id).id(id)
            case .tickets: AdminTicketView(id: id).id(id)
            case .dev: AdminDevDetailView(id: id).id(id)
            default: EmptyView()
            }
        }.onAppear {
            switch item {
            case .projects: projectID = id
            case .messaging: conversationID = id
            case .tickets: ticketID = id
            case .dev: issueID = id
            default: break
            }
        }
    }
    private var shortcuts: some View {
        ForEach(Array(store.availableSections.enumerated()), id: \.offset) { index, item in
            Button { section = item } label: { AdminText(item.title) }
                .keyboardShortcut(KeyEquivalent(Character(String(index + 1))), modifiers: .command)
                .hidden().accessibilityHidden(true)
        }
    }
    private func refreshCurrent() async {
        await store.refresh(current)
        switch current {
        case .projects:
            if let projectID {
                await store.loadProject(id: projectID)
                if store.projectFinances[projectID] != nil || store.errors[.finance(projectID)] != nil {
                    await store.loadProjectFinance(projectId: projectID)
                }
            }
            if store.user.permissions.contains("view_change_requests") { await store.loadChangeRequests() }
        case .messaging:
            if let conversationID { await store.loadMessages(conversationId: conversationID) }
        default: break
        }
    }
}

extension View {
    /// Les pages portent leur propre titre : le grand titre d'iOS ferait doublon.
    func inlineNavigationTitle() -> some View {
        #if os(iOS)
        navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }
}

extension AdminStore {
    var requestsToTriage: Int { changeRequests.filter { [.submitted, .toQuote].contains($0.status) }.count }
    func badge(for section: AdminSection) -> Int? {
        switch section {
        case .projects: requestsToTriage
        case .messaging: conversations.reduce(0) { $0 + $1.unreadCount }
        case .tickets: tickets.filter { [.open, .inProgress].contains($0.status) }.count
        case .dev: devIssues.filter { $0.status == .inProgress }.count
        default: nil
        }
    }
}
#endif
