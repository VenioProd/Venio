#if !os(watchOS)
import SwiftUI
import VenioTheme

struct AdminDocumentsView: View {
    @Environment(AdminStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.adminReadOnly) private var readOnly
    let detail: AdminProjectDetail
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            AdminText("Éléments du projet").font(.headline)
            if detail.items.isEmpty { AdminText("Aucun élément") }
            ForEach(detail.items) { item in
                VStack(alignment: .leading, spacing: 8) {
                    Text(verbatim: item.title).font(.headline)
                    AdminBadge(title: item.type.title)
                    if !readOnly && store.capabilities.canToggleVisibility {
                        Toggle(isOn: Binding(get: { item.isVisible }, set: { visible in
                            Task { await store.setItemVisibility(projectId: detail.project.id, itemId: item.id, visible: visible) }
                        })) { AdminText("Visible par le client") }
                            .disabled(store.inFlight.contains(.item(projectId: detail.project.id, itemId: item.id)))
                        AdminActionError(operation: .item(projectId: detail.project.id, itemId: item.id))
                    } else { AdminText(item.isVisible ? "Visible par le client" : "Masqué au client").font(.caption) }
                }
                Divider()
            }
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
        VStack(alignment: .leading, spacing: 16) {
            AdminText("Documents").font(.headline)
            if detail.documents.isEmpty { AdminEmptyView(title: "Aucun document") }
            ForEach(detail.documents) { document in
                VStack(alignment: .leading, spacing: 8) {
                    Text(verbatim: document.originalName).font(.headline)
                    AdminBadge(title: document.type.title)
                    Text(verbatim: AdminFormats(locale: locale).date(document.uploadedAt)).font(.caption)
                }
                Divider()
            }
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
    }
}

struct AdminProjectFinanceView: View {
    @Environment(AdminStore.self) private var store
    let id: String
    var body: some View {
        Group {
            if let error = store.errors[.finance(id)] {
                AdminFailureView(error: error) { await store.loadProjectFinance(projectId: id) }
            } else if let finance = store.projectFinances[id] {
                VStack(alignment: .leading, spacing: 16) {
                    AdminText("Comptabilité du projet").font(.headline)
                    AdminMoneyRow(title: "Facturé HT", cents: finance.invoicedHtCents)
                    AdminMoneyRow(title: "Encaissé TTC", cents: finance.receivedTtcCents)
                    AdminMoneyRow(title: "Reste à encaisser", cents: finance.remainingTtcCents)
                    AdminMoneyRow(title: "Coûts directs", cents: finance.directCostsCents)
                    AdminMoneyRow(title: "Marge", cents: finance.marginCents)
                    AdminBeneficiaries(balances: finance.beneficiaries)
                }.venioCard()
            } else { ProgressView { AdminText("Chargement") } }
        }.task(id: id) { await store.loadProjectFinance(projectId: id) }
    }
}
#endif
