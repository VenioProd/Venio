#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

public struct PipelineView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
    #endif
    private let onLead: (String) -> Void
    public init(onLead: @escaping (String) -> Void = { _ in }) { self.onLead = onLead }
    private var formats: CommercialFormats { CommercialFormats(locale: locale) }
    private var compact: Bool {
        #if os(iOS)
        sizeClass != .regular
        #else
        false
        #endif
    }
    public var body: some View {
        @Bindable var store = store
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VText("Pipeline").font(.largeTitle.bold())
                    Picker(CommercialStrings.text("Portée", locale: locale), selection: $store.allLeads) {
                        Text(verbatim: CommercialStrings.format("Mes leads %lld", locale: locale,
                            PipelineSummary(leads: store.leads, scope: .mine(store.currentUser?.id ?? "")).count)).tag(false)
                        Text(verbatim: CommercialStrings.format("Tous %lld", locale: locale,
                            PipelineSummary(leads: store.leads, scope: .all).count)).tag(true)
                    }.pickerStyle(.segmented)
                    HStack(alignment: .top, spacing: 14) {
                        total("Valeur totale", amount: store.summary.amount)
                        total("Valeur pondérée", amount: store.summary.weighted)
                    }
                    if compact {
                        ForEach(store.summary.stages.filter { store.allLeads || $0.count > 0 }) { stage in
                            VStack(alignment: .leading, spacing: 10) {
                                stageHeader(stage)
                                if stage.count > 0 {
                                    VStack(spacing: 0) {
                                        let leads = store.visibleLeads.filter { $0.status == stage.id }
                                        ForEach(leads) { lead in
                                            Button { onLead(lead.id) } label: {
                                                LeadRow(lead: lead, showsAssignee: true)
                                            }.buttonStyle(.plain)
                                            if lead.id != leads.last?.id { Divider() }
                                        }
                                    }.venioCard()
                                }
                            }
                        }
                    } else {
                        if geometry.size.width >= 1000 {
                            kanban(columnWidth: (geometry.size.width - 80) / 5)
                        } else {
                            ScrollView(.horizontal) { kanban(columnWidth: 260) }
                        }
                        HStack(alignment: .top, spacing: 16) {
                            funnel.venioCard().frame(maxWidth: .infinity)
                            if store.canViewFigures {
                                FinancialTimeline(months: store.figures.months).venioCard().frame(maxWidth: .infinity)
                                if store.figures.targetPercent != nil {
                                    MonthlyTargetCard(figures: store.figures).venioCard().frame(maxWidth: .infinity)
                                }
                            }
                        }
                    }
                }.padding()
            }
            .background { ThemedBackground() }
            .navigationTitle("")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
        }
    }
    private func kanban(columnWidth: CGFloat) -> some View {
        HStack(alignment: .top, spacing: 12) {
            ForEach(store.summary.stages) { stage in
                VStack(alignment: .leading, spacing: 12) {
                    stageHeader(stage)
                    ForEach(store.visibleLeads.filter { $0.status == stage.id }) { lead in
                        Button { onLead(lead.id) } label: { kanbanCard(lead) }.buttonStyle(.plain)
                    }
                }.frame(width: columnWidth).frame(maxWidth: .infinity)
            }
        }.padding(.bottom)
    }
    private var funnel: some View {
        VStack(alignment: .leading, spacing: 12) {
            VText("Entonnoir pondéré").font(.headline)
            ForEach(store.summary.stages) { stage in
                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        VText(stage.id.label)
                        Spacer()
                        Text(verbatim: formats.money(stage.weighted)).monospacedDigit()
                    }.font(.caption)
                    ProgressView(value: NSDecimalNumber(decimal: stage.weighted).doubleValue,
                                 total: max(1, NSDecimalNumber(decimal: store.summary.stages.map(\.weighted).max() ?? 0).doubleValue))
                        .tint(palette.accent.color)
                }
            }
        }
    }
    private func total(_ title: String, amount: Decimal) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            VText(title).font(.subheadline)
            Text(verbatim: formats.money(amount)).font(.title2.bold().monospacedDigit())
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
    }
    private func stageHeader(_ stage: PipelineSummary.Stage) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                VText(stage.id.label).font(.headline)
                CommercialBadge(text: formats.number(stage.count))
                Spacer(minLength: 4)
                Text(verbatim: formats.money(stage.amount)).font(.subheadline.weight(.semibold).monospacedDigit())
            }
            Text(verbatim: formats.percent(stage.id.probability) + " · " +
                 CommercialStrings.format("pond. %@", locale: locale, formats.money(stage.weighted)))
                .font(.caption).foregroundStyle(palette.textSecondary.color)
        }
    }
    private func kanbanCard(_ lead: Lead) -> some View {
        let mine = lead.assignedTo == store.currentUser?.id
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                CommercialBadge(text: CommercialStrings.text(lead.leadTemperature.label, locale: locale), tone: .warning)
                Spacer()
                Text(verbatim: store.initials(lead.assignedTo)).font(.caption.bold())
                    .accessibilityLabel(Text(verbatim: store.userName(lead.assignedTo) ?? CommercialStrings.text("Non assigné", locale: locale)))
            }
            Text(verbatim: lead.company).font(.headline)
            Text(verbatim: lead.contactName + " · " + CommercialStrings.text(lead.serviceType, locale: locale))
                .font(.caption).foregroundStyle(palette.textSecondary.color)
            HStack {
                Text(verbatim: formats.money(lead.budget)).font(.headline.monospacedDigit())
                Spacer()
                if let score = lead.score {
                    Text(verbatim: CommercialStrings.format("Score %lld", locale: locale, score)).font(.caption)
                }
            }
            if let date = lead.nextActionAt {
                Text(verbatim: CommercialStrings.format("Relance du %@", locale: locale, formats.date(date)))
                    .font(.caption).foregroundStyle(date < store.clock.now ? palette.urgent.color : palette.accentText.color)
            } else {
                VText("Aucune action prévue").font(.caption).foregroundStyle(palette.textSecondary.color)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).venioCard()
        .overlay {
            if store.allLeads && mine {
                RoundedRectangle(cornerRadius: 22).strokeBorder(palette.accent.color, lineWidth: 1)
            }
        }
        .opacity(store.allLeads && !mine ? 0.75 : 1)
    }
}
#endif
