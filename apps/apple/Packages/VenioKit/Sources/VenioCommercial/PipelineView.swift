#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

public struct PipelineView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    @State private var showingOverview = false
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
    #endif
    private let onLead: (String) -> Void
    private let transitionNamespace: Namespace.ID?
    public init(transitionNamespace: Namespace.ID? = nil, onLead: @escaping (String) -> Void = { _ in }) {
        self.transitionNamespace = transitionNamespace
        self.onLead = onLead
    }
    private var formats: CommercialFormats { CommercialFormats(locale: locale) }
    private var compact: Bool {
        #if os(iOS)
        sizeClass != .regular
        #else
        false
        #endif
    }
    public var body: some View {
        Group {
            if compact {
                CommercialPage {
                    VText("Pipeline").font(.largeTitle.bold())
                    scopePicker
                    HStack(alignment: .top, spacing: 16) {
                        total("Valeur totale", amount: store.summary.amount)
                        total("Valeur pondérée", amount: store.summary.weighted)
                    }
                    ForEach(store.summary.stages.filter { store.allLeads || $0.count > 0 }) { stage in
                        VStack(alignment: .leading, spacing: 8) {
                            stageHeader(stage)
                            if stage.count > 0 {
                                VStack(spacing: 0) {
                                    let leads = store.visibleLeads.filter { $0.status == stage.id }
                                    ForEach(leads) { lead in
                                        Button { onLead(lead.id) } label: {
                                            LeadRow(lead: lead, showsAssignee: true)
                                        }.buttonStyle(.plain)
                                            .leadInteractions(lead, swipe: true) { onLead(lead.id) }
                                            .leadTransitionSource(lead.id, namespace: transitionNamespace)
                                        if lead.id != leads.last?.id { Divider() }
                                    }
                                }.venioCard()
                            }
                        }
                    }
                }.commercialRefreshable()
            } else {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    kanban
                }.padding(16)
            }
        }
        .animation(.smooth, value: store.allLeads)
        .animation(.smooth, value: store.summary.stages.map(\.count))
        .background { ThemedBackground() }
        .navigationTitle("")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .inspector(isPresented: $showingOverview) {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack {
                        VText("Aperçu").font(.title2.bold())
                        Spacer()
                        Button { showingOverview = false } label: { VText("Fermer") }
                    }
                    PipelineFunnel(stages: store.summary.stages).venioCard()
                    if store.canViewFigures {
                        FinancialTimeline(months: store.figures.months).venioCard()
                        if store.figures.targetPercent != nil { MonthlyTargetCard(figures: store.figures).venioCard() }
                    }
                }.padding(16)
            }
            .background { ThemedBackground() }
            .inspectorColumnWidth(min: 280, ideal: 320, max: 400)
        }
    }
    private var scopePicker: some View {
        @Bindable var store = store
        return Picker(CommercialStrings.text("Portée", locale: locale), selection: $store.allLeads) {
            Text(verbatim: CommercialStrings.format("Mes leads %lld", locale: locale,
                PipelineSummary(leads: store.leads, scope: .mine(store.currentUser?.id ?? "")).count)).tag(false)
            Text(verbatim: CommercialStrings.format("Tous %lld", locale: locale,
                PipelineSummary(leads: store.leads, scope: .all).count)).tag(true)
        }.pickerStyle(.segmented)
    }
    private var header: some View {
        HStack(spacing: 16) {
            VText("Pipeline").font(.title2.bold())
            scopePicker.frame(maxWidth: 224)
            Spacer(minLength: 0)
            Text(verbatim: CommercialStrings.format("Total %@ · pondéré %@", locale: locale,
                formats.money(store.summary.amount), formats.money(store.summary.weighted)))
                .font(.subheadline.monospacedDigit()).foregroundStyle(palette.textSecondary.color)
                .lineLimit(1).minimumScaleFactor(0.75)
            Button { showingOverview.toggle() } label: {
                Label { VText("Aperçu") } icon: { Image(systemName: "sidebar.right") }
                    .labelStyle(.iconOnly).frame(width: 40, height: 40)
            }.buttonStyle(.plain)
            QuickEntryButton()
        }
    }
    private var kanban: some View {
        GeometryReader { geometry in
            HStack(alignment: .top, spacing: 16) {
                ForEach(store.summary.stages) { stage in
                    VStack(alignment: .leading, spacing: 16) {
                        stageHeader(stage)
                        ScrollView {
                            LazyVStack(spacing: 16) {
                                ForEach(store.visibleLeads.filter { $0.status == stage.id }) { lead in
                                    Button { onLead(lead.id) } label: { kanbanCard(lead) }.buttonStyle(.plain)
                                        .leadInteractions(lead) { onLead(lead.id) }
                                        .leadTransitionSource(lead.id, namespace: transitionNamespace)
                                }
                            }.padding(.bottom, 16)
                        }.commercialRefreshable()
                    }.frame(width: max(0, (geometry.size.width - 64) / 5))
                        .frame(maxHeight: .infinity, alignment: .topLeading)
                }
            }
        }
    }
    private func total(_ title: String, amount: Decimal) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            VText(title).font(.subheadline)
            Text(verbatim: formats.money(amount)).font(.title2.bold().monospacedDigit())
                .contentTransition(.numericText()).animation(.smooth, value: amount)
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
    }
    @ViewBuilder private func stageHeader(_ stage: PipelineSummary.Stage) -> some View {
        if compact {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    VText(stage.id.label).font(.headline).lineLimit(1).minimumScaleFactor(0.75)
                    CommercialBadge(text: formats.number(stage.count))
                    Spacer(minLength: 4)
                    Text(verbatim: formats.money(stage.amount)).font(.subheadline.weight(.semibold).monospacedDigit())
                }.lineLimit(1).minimumScaleFactor(0.7)
                stageWeight(stage)
            }
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text(verbatim: CommercialStrings.text(stage.id.label, locale: locale) + " · " + formats.number(stage.count) + " · " + formats.money(stage.amount))
                    .font(.subheadline.weight(.semibold).monospacedDigit()).lineLimit(1).minimumScaleFactor(0.65)
                stageWeight(stage)
            }.accessibilityElement(children: .combine)
        }
    }
    private func stageWeight(_ stage: PipelineSummary.Stage) -> some View {
        Text(verbatim: formats.percent(stage.id.probability) + " · " +
             CommercialStrings.format("pond. %@", locale: locale, formats.money(stage.weighted)))
            .font(.caption).foregroundStyle(palette.textSecondary.color).lineLimit(1).minimumScaleFactor(0.75)
    }
    private func kanbanCard(_ lead: Lead) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(verbatim: lead.company).font(.subheadline.weight(.semibold)).lineLimit(2)
            Text(verbatim: lead.contactName).font(.caption).foregroundStyle(palette.textSecondary.color).lineLimit(1)
            HStack(spacing: 8) {
                Text(verbatim: formats.money(lead.budget)).font(.subheadline.weight(.semibold).monospacedDigit())
                    .lineLimit(1).minimumScaleFactor(0.75)
                Spacer(minLength: 0)
                Image(systemName: temperatureIcon(lead))
                    .foregroundStyle(palette.warning.color)
                    .accessibilityLabel(Text(verbatim: CommercialStrings.text(lead.leadTemperature.label, locale: locale)))
                Text(verbatim: store.initials(lead.assignedTo))
                    .accessibilityLabel(Text(verbatim: store.userName(lead.assignedTo) ?? CommercialStrings.text("Non assigné", locale: locale)))
            }.font(.caption)
            if let state = lead.deliveryState { VText(state == "failed" ? "Échec de l’envoi" : "En attente").font(.caption) }
            if let date = lead.nextActionAt {
                Text(verbatim: formats.followUp(date, clock: store.clock))
                    .foregroundStyle(date < store.clock.now ? palette.urgent.color : palette.textSecondary.color)
                    .font(.caption).lineLimit(1)
            } else {
                VText("Aucune action prévue").font(.caption).foregroundStyle(palette.textSecondary.color).lineLimit(1)
            }
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
    }
    private func temperatureIcon(_ lead: Lead) -> String {
        switch lead.leadTemperature {
        case .cold: "snowflake"
        case .warm: "sun.haze"
        case .hot: "flame"
        case .veryHot: "flame.fill"
        }
    }
}
#endif
