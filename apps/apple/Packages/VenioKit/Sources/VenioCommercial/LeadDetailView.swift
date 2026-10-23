#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

public struct LeadDetailView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.openURL) private var openURL
    @Environment(\.venioPalette) private var palette
    let id: String
    public init(id: String) { self.id = id }
    private var formats: CommercialFormats { CommercialFormats(locale: locale) }
    public var body: some View {
        Group {
            if let lead = store.leads.first(where: { $0.id == id }) {
                CommercialPage {
                    header(lead)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 140))], alignment: .leading, spacing: 12) {
                        metric("Montant", value: formats.money(lead.budget))
                        metric("Probabilité", value: formats.percent(lead.status.probability))
                        metric("Assigné à", value: store.userName(lead.assignedTo) ?? CommercialStrings.text("Non assigné", locale: locale))
                    }.venioCard()
                    nextAction(lead)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 95))], spacing: 14) {
                        action("Appeler", icon: "phone", url: lead.phoneURL)
                        action("E-mail", icon: "envelope", url: lead.emailURL)
                        action("Relance", icon: "clock", url: nil)
                        action("Étape", icon: "arrow.right.circle", url: nil)
                        action("Devis", icon: "doc.text", url: nil)
                    }
                    if !lead.notes.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            VText("Note").font(.headline)
                            TranslatableText(lead.notes, preserving: store.contentIdentifiers)
                        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
                    }
                    VStack(alignment: .leading, spacing: 18) {
                        SectionHeading(title: "Timeline", count: store.timeline[id, default: []].count)
                        ForEach(store.timeline[id, default: []]) { entry in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(verbatim: formats.timestamp(entry.date)).font(.caption).foregroundStyle(palette.textSecondary.color)
                                TranslatableText(entry.title, preserving: store.contentIdentifiers)
                                if !entry.body.isEmpty { TranslatableText(entry.body, preserving: store.contentIdentifiers).font(.subheadline) }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                            Divider()
                        }
                    }.venioCard()
                }
                .navigationTitle(lead.company)
            } else {
                ContentUnavailableView(CommercialStrings.text("Lead indisponible", locale: locale), systemImage: "person.crop.circle.badge.questionmark")
            }
        }
        .background { ThemedBackground() }
    }
    private func header(_ lead: Lead) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                Text(verbatim: lead.initials).font(.title2.bold()).padding().venioCard()
                VStack(alignment: .leading, spacing: 6) {
                    Text(verbatim: lead.company).font(.largeTitle.bold())
                    Text(verbatim: lead.contactName + " · " + CommercialStrings.text(lead.serviceType, locale: locale)).font(.subheadline)
                }
            }
            ViewThatFits(in: .horizontal) {
                HStack { badges(lead) }
                VStack(alignment: .leading) { badges(lead) }
            }
        }
    }
    @ViewBuilder private func badges(_ lead: Lead) -> some View {
        CommercialBadge(text: CommercialStrings.text(lead.status.label, locale: locale))
        CommercialBadge(text: CommercialStrings.text(lead.leadTemperature.label, locale: locale), tone: .warning)
        if let score = lead.score { CommercialBadge(text: CommercialStrings.format("Score %lld", locale: locale, score)) }
    }
    private func metric(_ title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            VText(title).font(.caption).foregroundStyle(palette.textSecondary.color)
            Text(verbatim: value).font(.headline)
        }
    }
    private func nextAction(_ lead: Lead) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VText("Prochaine action").font(.headline)
            if let date = lead.nextActionAt {
                if store.clock.calendar.isDate(date, inSameDayAs: store.clock.now) {
                    Text(verbatim: CommercialStrings.format("Relance aujourd’hui · %@", locale: locale, formats.time(date)))
                } else {
                    Text(verbatim: CommercialStrings.format("Relance du %@", locale: locale, formats.timestamp(date)))
                }
                CommercialBadge(text: formats.countdown(to: date, from: store.clock.now), tone: date < store.clock.now ? .urgent : .accent)
            } else { VText("Aucune action prévue") }
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
    }
    private func action(_ title: String, icon: String, url: URL?) -> some View {
        Button {
            if let url { openURL(url) }
        } label: {
            VStack(spacing: 8) {
                Image(systemName: icon).font(.title3).accessibilityHidden(true)
                VText(title).font(.caption)
            }.frame(maxWidth: .infinity).padding(.vertical, 8)
        }.buttonStyle(.bordered).disabled(url == nil)
    }
}
#endif
