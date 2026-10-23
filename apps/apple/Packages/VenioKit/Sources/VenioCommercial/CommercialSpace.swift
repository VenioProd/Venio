#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

public struct CommercialSpace: View {
    private let api: any VenioAPI
    private let user: UserSummary

    public init(api: any VenioAPI, user: UserSummary) {
        self.api = api
        self.user = user
    }

    public var body: some View {
        TabView {
            NavigationStack { PipelineView(api: api, userId: user.id) }
                .tabItem { Label("Pipeline", systemImage: "chart.bar") }
            NavigationStack { AppearanceView() }
                .tabItem { Label("Réglages", systemImage: "gearshape") }
        }
    }
}

private struct PipelineView: View {
    let api: any VenioAPI
    let userId: String
    @State private var summary: PipelineSummary?
    @State private var allLeads = false
    @State private var errorMessage: String?
    @Environment(\.venioPalette) private var palette

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Toggle("Tous les leads", isOn: $allLeads)
                if let summary {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("\(summary.count) leads ouverts").font(.title.bold())
                        Text(summary.amount, format: .currency(code: "EUR"))
                        Text("Pondéré : \(summary.weighted.formatted(.currency(code: "EUR")))")
                            .foregroundStyle(palette.textSecondary.color)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .venioCard()
                } else if let errorMessage {
                    Text(errorMessage)
                } else {
                    ProgressView("Chargement du pipeline")
                }
            }
            .padding()
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .background { ThemedBackground() }
        .navigationTitle("Pipeline")
        .task(id: allLeads) {
            summary = nil
            errorMessage = nil
            do {
                let leads = try await api.leads()
                try Task.checkCancellation()
                summary = PipelineSummary(leads: leads, scope: allLeads ? .all : .mine(userId))
                errorMessage = nil
            } catch is CancellationError {
                return
            } catch { errorMessage = "Le pipeline est indisponible." }
        }
    }
}

public struct AdminPlaceholderView: View {
    public init() {}
    public var body: some View {
        Text("Espace administration").font(.title)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background { ThemedBackground() }
    }
}
#endif
