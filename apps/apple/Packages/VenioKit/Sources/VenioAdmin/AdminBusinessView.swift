#if !os(watchOS)
import SwiftUI
import VenioTheme

struct AdminBusinessView: View {
    @Environment(AdminStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.adminReadOnly) private var readOnly
    @State private var reminderIDs: [String] = []
    @State private var confirming = false
    @State private var remindingAll = false
    let navigate: (AdminSection) -> Void
    private var formats: AdminFormats { AdminFormats(locale: locale) }
    var body: some View {
        AdminSectionContent(section: .business) {
            if let overview = store.business {
                let figures = BusinessFigures(overview: overview, clock: store.clock)
                AdminPage {
                    VStack(alignment: .leading, spacing: 6) {
                        AdminText("Vue business").font(.largeTitle.bold())
                        Text(verbatim: formats.date(overview.month, template: "MMMMyyyy") + " · " + formats.date(store.clock.now, template: "EEEEdMMM"))
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 260), alignment: .top)], spacing: 16) {
                        metric("CA facturé du mois", cents: overview.invoicedCents) {
                            Text(verbatim: formats.date(overview.month, template: "MMMMyyyy"))
                        }
                        metric("Encaissé", cents: overview.receivedCents) {
                            if let percent = figures.receivedPercent {
                                Text(verbatim: AdminStrings.format("%@ du facturé", locale: locale, formats.percent(percent)))
                                ProgressView(value: Double(min(100, max(0, percent))), total: 100)
                            }
                        }
                        metric("Trésorerie disponible", cents: overview.availableCashCents) {
                            Text(verbatim: formats.date(store.clock.now))
                        }
                        metric("Factures en retard", cents: figures.overdueCents) {
                            Text(verbatim: AdminStrings.format("%lld factures échues", locale: locale, overview.overdueInvoices.count))
                        }
                    }
                    AdminFinancialTimeline(figures: figures).venioCard()
                    overdue(overview, figures: figures)
                    VStack(alignment: .leading, spacing: 16) {
                        AdminText("Comptabilité des projets").font(.headline)
                        AdminMoneyRow(title: "Marge", cents: overview.finance.marginCents)
                        AdminMoneyRow(title: "Reste à encaisser", cents: overview.finance.remainingTtcCents)
                        AdminBeneficiaries(balances: overview.finance.beneficiaries)
                    }.venioCard()
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 170))], spacing: 16) {
                        shortcut(.tickets, title: "Tickets ouverts")
                        shortcut(.projects, title: "Demandes à trier")
                        shortcut(.dev, title: "Issues de dev en cours")
                        shortcut(.messaging, title: "Messages non lus")
                    }
                }
            } else { AdminEmptyView(title: "Aucune donnée business") }
        }
        .confirmationDialog(AdminStrings.text("Envoyer une relance par e-mail ?", locale: locale), isPresented: $confirming, titleVisibility: .visible) {
            Button {
                let ids = reminderIDs
                remindingAll = ids.count > 1
                Task {
                    defer { remindingAll = false }
                    for id in ids { await store.remindInvoice(id: id) }
                }
            } label: { AdminText("Envoyer les relances") }
            Button(role: .cancel) {} label: { AdminText("Annuler") }
        } message: { AdminText("Chaque client concerné recevra un e-mail de relance.") }
    }
    private func metric<Detail: View>(_ title: String, cents: Int, @ViewBuilder detail: () -> Detail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            AdminText(title).font(.subheadline)
            AdminMoney(cents: cents).font(.title2.bold())
            detail().font(.caption)
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).venioCard()
    }
    private func overdue(_ overview: BusinessOverview, figures: BusinessFigures) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            AdminText("Factures en retard").font(.headline)
            if overview.overdueInvoices.isEmpty { AdminEmptyView(title: "Aucune facture en retard") }
            ForEach(overview.overdueInvoices) { invoice in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(verbatim: invoice.number).font(.headline)
                            Text(verbatim: invoice.clientName).font(.subheadline)
                        }
                        Spacer()
                        AdminMoney(cents: invoice.remainingCents).font(.headline)
                    }
                    Text(verbatim: AdminStrings.format("%lld jours de retard", locale: locale, figures.overdueDays(for: invoice))).font(.caption)
                    if let date = invoice.lastReminderAt {
                        Text(verbatim: AdminStrings.format("Dernière relance : %@", locale: locale, formats.date(date))).font(.caption)
                    }
                    if !readOnly && store.capabilities.canRemindInvoices {
                        Button { reminderIDs = [invoice.id]; confirming = true } label: { AdminText("Relancer") }.buttonStyle(.bordered)
                            .disabled(remindingAll || store.inFlight.contains(.invoice(invoice.id)))
                        AdminActionError(operation: .invoice(invoice.id))
                    }
                }
                Divider()
            }
            AdminMoneyRow(title: "Total en retard", cents: figures.overdueCents)
            if !readOnly && store.capabilities.canRemindInvoices && !overview.overdueInvoices.isEmpty {
                Button {
                    reminderIDs = overview.overdueInvoices.map(\.id); confirming = true
                } label: {
                    Text(verbatim: AdminStrings.format("Relancer les %lld factures", locale: locale, overview.overdueInvoices.count))
                }.buttonStyle(.borderedProminent).disabled(remindingAll || overview.overdueInvoices.contains { store.inFlight.contains(.invoice($0.id)) })
            }
        }.venioCard()
    }
    @ViewBuilder private func shortcut(_ section: AdminSection, title: String) -> some View {
        if store.availableSections.contains(section) {
            Button { navigate(section) } label: {
                VStack(alignment: .leading, spacing: 8) {
                    if store.state(for: section) == .loaded {
                        Text(store.badge(for: section) ?? 0, format: .number).font(.title.bold().monospacedDigit())
                    } else { AdminText("—").font(.title) }
                    AdminText(title).font(.subheadline)
                }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
            }.buttonStyle(.plain)
        }
    }
}
#endif
