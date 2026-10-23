#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

public struct PipelineView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
    #endif
    private let onLead: (String) -> Void
    public init(onLead: @escaping (String) -> Void = { _ in }) { self.onLead = onLead }
    private var formats: CommercialFormats { CommercialFormats(locale: locale) }
    private var compact: Bool {
        #if os(iOS)
        sizeClass == .compact
        #else
        false
        #endif
    }
    public var body: some View {
        @Bindable var store = store
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Picker(CommercialStrings.text("Portée", locale: locale), selection: $store.allLeads) {
                    Text(verbatim: CommercialStrings.format("Mes leads %lld", locale: locale,
                        PipelineSummary(leads: store.leads, scope: .mine(store.currentUser?.id ?? "")).count)).tag(false)
                    Text(verbatim: CommercialStrings.format("Tous %lld", locale: locale,
                        PipelineSummary(leads: store.leads, scope: .all).count)).tag(true)
                }.pickerStyle(.segmented)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 160))], spacing: 14) {
                    total("Valeur totale", amount: store.summary.amount)
                    total("Valeur pondérée", amount: store.summary.weighted)
                }
                if compact {
                    ForEach(store.summary.stages) { stage in stageColumn(stage) }
                } else {
                    ScrollView(.horizontal) {
                        HStack(alignment: .top, spacing: 18) {
                            ForEach(store.summary.stages) { stage in stageColumn(stage).frame(width: 300) }
                        }.padding(.bottom)
                    }
                }
            }.padding()
        }
        .background { ThemedBackground() }
        .navigationTitle(CommercialStrings.text("Pipeline", locale: locale))
    }
    private func total(_ title: String, amount: Decimal) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            VText(title).font(.subheadline)
            Text(verbatim: formats.money(amount)).font(.title2.bold().monospacedDigit())
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
    }
    private func stageColumn(_ stage: PipelineSummary.Stage) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                SectionHeading(title: stage.id.label, count: stage.count)
                Text(verbatim: formats.percent(stage.id.probability) + " · " + formats.money(stage.amount)).font(.subheadline)
                Text(verbatim: CommercialStrings.text("Pondéré", locale: locale) + " " + formats.money(stage.weighted)).font(.caption)
            }.padding(.horizontal, 4)
            ForEach(store.visibleLeads.filter { $0.status == stage.id }) { lead in
                Button { onLead(lead.id) } label: {
                    LeadRow(lead: lead, showsAssignee: true,
                            highlight: store.allLeads && lead.assignedTo == store.currentUser?.id)
                }.buttonStyle(.plain)
            }
        }
    }
}
#endif
