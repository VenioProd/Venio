#if !os(watchOS)
import SwiftUI
import VenioTheme

private struct AdminReadOnlyKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    var adminReadOnly: Bool {
        get { self[AdminReadOnlyKey.self] }
        set { self[AdminReadOnlyKey.self] = newValue }
    }
}

struct AdminPage<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) { content }
                .padding().frame(maxWidth: 1100).frame(maxWidth: .infinity)
        }.background { ThemedBackground() }
    }
}

struct AdminBadge: View {
    @Environment(\.venioPalette) private var palette
    let title: String
    var body: some View {
        AdminText(title).font(.caption.weight(.semibold))
            .padding(.horizontal, 8).padding(.vertical, 5)
            .foregroundStyle(palette.accentText.color)
            .background(palette.accent.color.opacity(0.12), in: Capsule())
    }
}

struct AdminMoney: View {
    @Environment(\.locale) private var locale
    let cents: Int
    var body: some View {
        Text(verbatim: AdminFormats(locale: locale).money(cents)).monospacedDigit().privacySensitive()
    }
}

struct AdminMoneyRow: View {
    let title: String
    let cents: Int
    var body: some View {
        LabeledContent { AdminMoney(cents: cents) } label: { AdminText(title) }
    }
}

struct AdminFailureView: View {
    @Environment(\.locale) private var locale
    let error: AdminAPIError
    let retry: () async -> Void
    var body: some View {
        ContentUnavailableView {
            Label {
                AdminText(error == .webOnly ? "Disponible sur le web" : error.messageKey)
            } icon: { Image(systemName: error == .forbidden ? "lock" : "exclamationmark.icloud") }
        } description: {
            if error == .webOnly { AdminText(error.messageKey) }
        } actions: {
            if error == .webOnly { AdminWebLink(title: "Ouvrir le site web") }
            else if error != .forbidden {
                Button { Task { await retry() } } label: { AdminText("Réessayer") }
            }
        }
    }
}

struct AdminWebLink: View {
    let title: String
    var body: some View {
        Link(destination: URL(string: "https://venio.paris/admin")!) { AdminText(title) }
    }
}

struct AdminActionError: View {
    @Environment(AdminStore.self) private var store
    @Environment(\.venioPalette) private var palette
    let operation: AdminOperation
    var body: some View {
        if let error = store.errors[operation] {
            AdminText(error.messageKey).font(.caption).foregroundStyle(palette.urgent.color)
                .accessibilityAddTraits(.updatesFrequently)
        }
    }
}

struct AdminSectionContent<Content: View>: View {
    @Environment(AdminStore.self) private var store
    let section: AdminSection
    @ViewBuilder let content: Content
    var body: some View {
        Group {
            switch store.state(for: section) {
            case .idle, .loading: ProgressView { AdminText("Chargement") }
            case .failed(let error): AdminFailureView(error: error) { await store.refresh(section) }
            case .loaded: content
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity).background { ThemedBackground() }
    }
}

struct AdminEmptyView: View {
    @Environment(\.locale) private var locale
    let title: String
    var icon = "tray"
    var body: some View {
        ContentUnavailableView(AdminStrings.text(title, locale: locale), systemImage: icon)
    }
}

struct AdminBeneficiaries: View {
    let balances: [BeneficiaryBalance]
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AdminText("Restant dû par bénéficiaire").font(.headline)
            ForEach(Array(balances.enumerated()), id: \.offset) { _, balance in
                LabeledContent { AdminMoney(cents: balance.remainingCents) } label: {
                    Text(verbatim: balance.displayName)
                }
            }
        }
    }
}
#endif
