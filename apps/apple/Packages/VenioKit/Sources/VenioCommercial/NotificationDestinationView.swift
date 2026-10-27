#if !os(watchOS)
import SwiftUI
import VenioCore

struct NotificationDestinationView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.dismiss) private var dismiss
    let destination: DeepLink
    var body: some View {
        NavigationStack {
            Group {
                switch destination {
                case .today, .pipeline, .figures: EmptyView()
                case .lead(let id): LeadDetailView(id: id)
                case .quote(let id): QuoteDetailView(id: id)
                case .project(let id): ProjectDetailView(id: id)
                case .projectQuotes(let id):
                    CommercialPage {
                        VText("Devis du projet").font(.title)
                        ForEach(store.quotes.filter { $0.project == id }) { quote in
                            NavigationLink { QuoteDetailView(id: quote.id) } label: { Text(verbatim: quote.title) }
                        }
                    }
                }
            }.toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { VText("Fermer") } } }
        }
    }
}
#endif
