#if !os(watchOS)
import SwiftUI
import VenioTheme

struct AdminProjectFollowView: View {
    @Environment(AdminStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.adminReadOnly) private var readOnly
    let detail: AdminProjectDetail
    @Binding var updateTitle: String
    @Binding var updateBody: String
    @State private var confirming = false
    private var id: String { detail.project.id }
    private var formats: AdminFormats { AdminFormats(locale: locale) }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            AdminText("Phases").font(.headline)
            ForEach(detail.phases.sorted { $0.order < $1.order }) { phase in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(verbatim: String(phase.order) + " · " + AdminStrings.text(phase.title, locale: locale)).font(.headline)
                        Spacer()
                        AdminBadge(title: phase.status.title)
                    }
                    if let date = phase.dueAt { Text(verbatim: formats.date(date)).font(.caption) }
                    if !readOnly && store.capabilities.canManagePhases {
                        ViewThatFits(in: .horizontal) {
                            HStack { phaseButtons(phase) }
                            VStack(alignment: .leading) { phaseButtons(phase) }
                        }
                        AdminActionError(operation: .phase(projectId: id, phaseId: phase.id))
                    }
                    Divider()
                }
            }
            ProgressView(value: Double(detail.project.progress), total: 100) {
                AdminText("Avancement global")
            } currentValueLabel: { Text(verbatim: formats.percent(detail.project.progress)) }
        }.venioCard()
        VStack(alignment: .leading, spacing: 12) {
            AdminText("Finances").font(.headline)
            let project = detail.project
            AdminMoneyRow(title: "Budget", cents: project.budgetCents, currency: project.currency)
            AdminMoneyRow(title: "Facturé", cents: project.invoicedCents, currency: project.currency)
            AdminMoneyRow(title: "Reste à facturer", cents: project.budgetCents.flatMap { budget in project.invoicedCents.map { budget - $0 } },
                          currency: project.currency)
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
        VStack(alignment: .leading, spacing: 16) {
            AdminText("Dernières mises à jour client").font(.headline)
            if detail.updates.isEmpty { AdminText("Aucune mise à jour") }
            ForEach(detail.updates.sorted { $0.createdAt > $1.createdAt }) { update in
                VStack(alignment: .leading, spacing: 8) {
                    Text(verbatim: update.title).font(.headline)
                    Text(verbatim: update.body)
                    Text(verbatim: formats.date(update.createdAt)).font(.caption)
                }
                Divider()
            }
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
        if !readOnly && store.capabilities.canPublishUpdates {
            composer
        }
    }
    private func phaseButtons(_ phase: AdminPhase) -> some View {
        ForEach(phase.allowedActions, id: \.rawValue) { action in
            Button {
                Task { await store.transitionPhase(projectId: id, phaseId: phase.id, action: action) }
            } label: { AdminText(action.title) }.buttonStyle(.bordered)
                .disabled(store.inFlight.contains(.phase(projectId: id, phaseId: phase.id)))
        }
    }
    private var composer: some View {
        VStack(alignment: .leading, spacing: 12) {
            AdminText("Mise à jour client").font(.headline)
            TextField(AdminStrings.text("Titre", locale: locale), text: $updateTitle).textFieldStyle(.roundedBorder)
                .disabled(store.inFlight.contains(.update(id)))
            TextEditor(text: $updateBody).frame(minHeight: 130)
                .accessibilityLabel(Text(verbatim: AdminStrings.text("Texte de la mise à jour", locale: locale)))
                .disabled(store.inFlight.contains(.update(id)))
            Button { confirming = true } label: { AdminText("Publier au client") }.venioPrimaryButton()
                .disabled(updateTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || updateBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.inFlight.contains(.update(id)))
            AdminText("La publication est immédiate et envoie un e-mail au client.").font(.caption)
            AdminActionError(operation: .update(id))
        }.venioCard()
        .confirmationDialog(AdminStrings.text("Publier et prévenir le client ?", locale: locale), isPresented: $confirming, titleVisibility: .visible) {
            Button {
                let title = updateTitle, body = updateBody
                Task {
                    await store.publishUpdate(projectId: id, title: title, body: body)
                    if store.errors[.update(id)] == nil { updateTitle = ""; updateBody = "" }
                }
            } label: { AdminText("Publier au client") }
            Button(role: .cancel) {} label: { AdminText("Annuler") }
        } message: { AdminText("La publication est immédiate et envoie un e-mail au client.") }
    }
}
#endif
