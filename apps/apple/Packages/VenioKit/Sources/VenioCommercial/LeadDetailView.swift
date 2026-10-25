#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

public struct LeadDetailView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.openURL) private var openURL
    @Environment(\.venioPalette) private var palette
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
    #endif
    private var regular: Bool {
        #if os(iOS)
        sizeClass == .regular
        #else
        true
        #endif
    }
    @State private var showingVoice = false
    @State private var showingQuote = false
    @State private var showingFollowUp = false
    @State private var showingStage = false
    let id: String
    public init(id: String) { self.id = id }
    private var formats: CommercialFormats { CommercialFormats(locale: locale) }
    public var body: some View {
        Group {
            if let lead = store.lead(for: id) {
                CommercialPage {
                    header(lead).leadInteractions(lead)
                    if regular {
                        HStack(alignment: .top, spacing: 22) {
                            information(lead).frame(maxWidth: .infinity)
                            timeline.frame(maxWidth: .infinity)
                        }
                    } else {
                        information(lead)
                        timeline
                    }
                }
                .navigationTitle("")
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
            } else {
                ContentUnavailableView(CommercialStrings.text("Lead indisponible", locale: locale), systemImage: "person.crop.circle.badge.questionmark")
            }
        }
        .task(id: id) { await store.openLead(id: id) }
        .background { ThemedBackground() }
        .sheet(isPresented: $showingVoice) {
            if let lead = store.lead(for: id) { VoiceNoteView(lead: lead) }
        }
        .sheet(isPresented: $showingFollowUp) {
            if let lead = store.lead(for: id) { LeadFollowUpSheet(lead: lead, clock: store.clock) }
        }
        .sheet(isPresented: $showingStage) {
            if let lead = store.lead(for: id) { LeadStageSheet(lead: lead) }
        }
        .sheet(isPresented: $showingQuote) {
            if let lead = store.lead(for: id) {
                NewQuoteView(leadId: lead.id)
            }
        }
    }
    private func canEdit(_ lead: Lead) -> Bool {
        store.currentUser?.permissions.contains("manage_crm") == true && lead.assignedTo == store.currentUser?.id
    }
    private func information(_ lead: Lead) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 140))], alignment: .leading, spacing: 12) {
                metric("Montant", value: formats.money(lead.budget))
                metric("Probabilité", value: formats.percent(lead.status.probability))
                metric("Assigné à", value: store.userName(lead.assignedTo) ?? CommercialStrings.text("Non assigné", locale: locale))
            }.venioCard()
            nextAction(lead)
            HStack(spacing: 6) {
                action("Appeler", icon: "phone", url: lead.phoneURL)
                action("E-mail", icon: "envelope", url: lead.emailURL)
                editAction("Relance", icon: "clock") { showingFollowUp = true }
                    .disabled(!canEdit(lead)).accessibilityIdentifier("lead.followUp")
                editAction("Étape", icon: "arrow.right.circle") { showingStage = true }
                    .disabled(!canEdit(lead)).accessibilityIdentifier("lead.stage")
                if store.canManageQuotes {
                    Button { showingQuote = true } label: {
                        VStack(spacing: 8) {
                            Image(systemName: "doc.text").font(.title3).accessibilityHidden(true)
                            VText("Devis").font(.caption)
                        }.frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(palette.accent.color.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                    }.buttonStyle(.plain).frame(maxWidth: .infinity).disabled(!lead.canQuote)
                }
            }
            if store.canManageQuotes && !lead.canQuote {
                VText("Aucun projet lié dans votre portefeuille. Vous devez être responsable du projet ou propriétaire du compte client.").font(.caption).foregroundStyle(palette.textSecondary.color)
            }
            VStack(alignment: .leading, spacing: 12) {
                Button { showingVoice = true } label: {
                    Label { VText("Note vocale") } icon: { Image(systemName: "mic.fill") }
                        .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                }.accessibilityIdentifier("lead.voiceNote").disabled(store.currentUser?.permissions.contains("manage_crm") != true || lead.assignedTo != store.currentUser?.id)
            }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
            if !lead.notes.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    VText("Note").font(.headline)
                    TranslatableText(lead.notes, preserving: store.contentIdentifiers)
                }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
            }
        }
    }
    private var timeline: some View {
        VStack(alignment: .leading, spacing: 18) {
            SectionHeading(title: "Timeline", count: store.timeline[store.lead(for: id)?.id ?? id, default: []].count)
            ForEach(store.timeline[store.lead(for: id)?.id ?? id, default: []]) { entry in
                VStack(alignment: .leading, spacing: 8) {
                    if let state = entry.deliveryState { VText(state == .pending ? "En attente" : "Échec de l’envoi").font(.caption) }
                    Text(verbatim: formats.timestamp(entry.date)).font(.caption).foregroundStyle(palette.textSecondary.color)
                    TranslatableText(entry.title, preserving: store.contentIdentifiers)
                    if !entry.body.isEmpty { TranslatableText(entry.body, preserving: store.contentIdentifiers).font(.subheadline) }
                }.frame(maxWidth: .infinity, alignment: .leading)
                Divider()
            }
        }.venioCard()
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
        if let state = lead.deliveryState { CommercialBadge(text: CommercialStrings.text(state == "failed" ? "Échec de l’envoi" : "En attente", locale: locale)) }
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
                Text(verbatim: formats.followUp(date, clock: store.clock))
                CommercialBadge(text: formats.countdown(to: date, from: store.clock.now), tone: date < store.clock.now ? .urgent : .accent)
            } else { VText("Aucune action prévue") }
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
    }
    private func editAction(_ title: String, icon: String, perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            VStack(spacing: 8) {
                Image(systemName: icon).font(.title3).accessibilityHidden(true)
                VText(title).font(.caption)
            }.frame(maxWidth: .infinity).padding(.vertical, 12)
                .background(palette.accent.color.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
        }.buttonStyle(.plain).frame(maxWidth: .infinity)
    }
    private func action(_ title: String, icon: String, url: URL?) -> some View {
        Button {
            if let url {
                #if os(iOS)
                if title == "Appeler", let lead = store.lead(for: id) {
                    store.beginCall(lead)
                    openURL(url) { accepted in if !accepted { store.cancelCall() } }
                } else { openURL(url) }
                #else
                openURL(url)
                #endif
            }
        } label: {
            VStack(spacing: 8) {
                Image(systemName: icon).font(.title3).accessibilityHidden(true)
                VText(title).font(.caption)
            }.frame(maxWidth: .infinity).padding(.vertical, 12)
                .background(palette.accent.color.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
        }.buttonStyle(.plain).frame(maxWidth: .infinity).disabled(url == nil)
    }
}
#endif
