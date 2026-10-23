#if !os(watchOS)
import SwiftUI
import VenioCore

public struct RootView: View {
    private let api: any VenioAPI
    @State private var user: UserSummary?
    @State private var failed = false

    public init(api: any VenioAPI) { self.api = api }

    public var body: some View {
        Group {
            if let user {
                switch user.role {
                case .commercial: CommercialSpace(api: api, user: user)
                case .admin: AdminPlaceholderView()
                }
            } else if failed {
                ContentUnavailableView("Session indisponible", systemImage: "person.crop.circle.badge.exclamationmark")
            } else {
                ProgressView("Ouverture de Venio")
            }
        }
        .task {
            do { user = try await api.currentUser() }
            catch { failed = true }
        }
    }
}
#endif
