#if os(iOS)
import SwiftUI
import VenioCore
import VenioTheme

// Poste d'appel (lot N) : appel en cours, résultat après l'appel, file d'appels, appels d'une fiche.
// L'app ne manipule jamais le numéro du prospect : le serveur le résout depuis la fiche.

public extension EnvironmentValues {
    @Entry var callDesk: CallDesk? = nil
}

enum CallDeskText {
    static func failure(_ failure: CallFailure) -> String {
        switch failure {
        case .fallback(.disabled): "La téléphonie de Venio n’est pas active : l’appel passera par le téléphone."
        case .fallback(.microphoneDenied): "Accès au micro refusé. Autorisez-le dans Réglages, ou appelez avec le téléphone."
        case .server("PHONE_SUPPRESSED"): "Ce numéro est en opposition : il ne peut plus être appelé."
        case .server("OUTSIDE_CALLING_HOURS"): "Hors de la plage d’appel autorisée."
        case .server("ATTEMPT_CAP_REACHED"): "Nombre d’appels du jour atteint pour ce numéro."
        case .server("LEAD_NOT_CALLABLE"): "Cette fiche ne peut pas être appelée (retenue, exclue ou sans numéro)."
        case .server("NOT_FOUND"): "Fiche introuvable dans votre périmètre."
        case .server, .call: "L’appel n’a pas pu aboutir. Réessayez."
        }
    }
    static func phase(_ phase: CallPhase) -> String {
        switch phase {
        case .idle, .preparing: "Préparation de l’appel…"
        case .connecting: "Connexion…"
        case .ringing: "Ça sonne…"
        case .active: "En communication"
        case .reconnecting: "Reconnexion…"
        case .ending: "Fin de l’appel…"
        }
    }
    static func transcript(_ call: LeadCall) -> String? {
        guard call.answeredAt != nil else { return nil }
        if call.recording?.objection == true { return "Pas de transcript : le prospect a refusé l’enregistrement" }
        switch call.transcriptStatus {
        case "DONE": return "Transcript prêt"
        case "FAILED": return "Transcript en échec"
        case "SKIPPED": return "Pas de transcript"
        case nil where call.recording?.status == "NONE": return "Appel non enregistré"
        default: return "Transcript en cours"
        }
    }
    static func analysis(_ call: LeadCall) -> String? {
        guard call.transcriptStatus == "DONE" else { return nil }
        switch call.analysisStatus {
        case "READY": return "Analyse à valider"
        case "APPLIED", "PARTIAL": return "Analyse validée"
        case "REJECTED": return "Analyse écartée"
        case "FAILED": return "Analyse en échec"
        default: return "Analyse en cours"
        }
    }
}

/// Monte le poste d'appel sur l'espace commercial : réglages au chargement, écran d'appel, résultat, erreurs.
/// Le résultat et les erreurs ne s'affichent qu'une fois l'écran d'appel refermé (deux présentations à la fois échouent).
struct CallDeskHost: ViewModifier {
    @Environment(\.callDesk) private var desk
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.openURL) private var openURL
    @State private var coverShown = false

    func body(content: Content) -> some View {
        if let desk {
            content
                .task(id: store.currentUser?.id) { await desk.prepare() }
                .onChange(of: desk.inCall, initial: true) { _, inCall in if inCall { coverShown = true } }
                .fullScreenCover(isPresented: Binding(get: { desk.inCall }, set: { _ in }), onDismiss: { coverShown = false }) {
                    ActiveCallView(desk: desk)
                }
                .sheet(item: Binding(get: { coverShown ? nil : desk.finished }, set: { desk.finished = $0 })) { call in
                    AfterCallView(desk: desk, call: call)
                }
                .alert(CommercialStrings.text("Appel", locale: locale), isPresented: Binding(
                    get: { desk.failure != nil && !desk.busy && !coverShown }, set: { if !$0 { desk.dismissFailure() } })) {
                    if case .fallback = desk.failure, let lead = desk.leadId.flatMap(store.lead(for:)), let url = lead.phoneURL {
                        Button { store.beginCall(lead); openURL(url) { if !$0 { store.cancelCall() } } } label: { VText("Appeler avec le téléphone") }
                    }
                    Button(role: .cancel) {} label: { VText("Fermer") }
                } message: {
                    if let failure = desk.failure { VText(CallDeskText.failure(failure)) }
                }
        } else { content }
    }
}

struct ActiveCallView: View {
    @Environment(\.venioPalette) private var palette
    @Environment(\.locale) private var locale
    let desk: CallDesk
    @State private var showingKeypad = false
    @State private var typed = ""

    var body: some View {
        VStack(spacing: 24) {
            VStack(spacing: 8) {
                Text(verbatim: desk.leadName).font(.largeTitle.bold()).multilineTextAlignment(.center)
                VText(CallDeskText.phase(desk.phase)).font(.headline).foregroundStyle(palette.textSecondary.color)
                    .accessibilityIdentifier("call.phase")
                if let answeredAt = desk.answeredAt, desk.phase == .active || desk.phase == .reconnecting {
                    TimelineView(.periodic(from: answeredAt, by: 1)) { context in
                        Text(verbatim: Duration.seconds(max(0, context.date.timeIntervalSince(answeredAt))).formatted(.time(pattern: .minuteSecond)))
                            .font(.title2.monospacedDigit())
                    }
                }
            }.padding(.top, 40)
            if let notice = desk.recordingNotice, desk.phase == .active || desk.phase == .reconnecting { recording(notice) }
            Spacer()
            if showingKeypad { keypad }
            HStack(spacing: 28) {
                control(desk.muted ? "Réactiver le micro" : "Muet", icon: desk.muted ? "mic.slash.fill" : "mic.fill", on: desk.muted) { desk.toggleMute() }
                    .disabled(!(desk.phase == .active || desk.phase == .reconnecting))
                control("Clavier", icon: "circle.grid.3x3.fill", on: showingKeypad) { showingKeypad.toggle() }
                    .disabled(desk.phase != .active)
            }
            Button(role: .destructive) { desk.hangup() } label: {
                Image(systemName: "phone.down.fill").font(.title).frame(width: 76, height: 76)
                    .background(palette.urgent.color, in: Circle()).foregroundStyle(.white)
            }.accessibilityLabel(Text(verbatim: CommercialStrings.text("Raccrocher", locale: locale)))
                .accessibilityIdentifier("call.hangup").disabled(desk.phase == .ending).padding(.bottom, 24)
        }
        .padding().frame(maxWidth: .infinity)
        .background { ThemedBackground() }
        .interactiveDismissDisabled()
    }

    /// L'opposition du prospect, en un geste : pas de confirmation en plein appel.
    @ViewBuilder private func recording(_ notice: CallRecordingConfig) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            switch desk.recordingStop {
            case .stopped:
                Label { VText("Enregistrement arrêté : ce qui avait été capté est effacé et rien ne sera transcrit.") }
                    icon: { Image(systemName: "checkmark.circle.fill").foregroundStyle(palette.success.color) }
                    .accessibilityIdentifier("call.recordingStopped")
            default:
                Label { VText("Enregistrement en cours.") } icon: { Image(systemName: "record.circle").foregroundStyle(palette.urgent.color) }
                if notice.notice { VText("Le prospect en est prévenu par un message automatique.").font(.caption).foregroundStyle(palette.textSecondary.color) }
                if desk.recordingStop == .failed { VText("L’arrêt n’a pas été confirmé : l’enregistrement tourne peut-être encore. Réessayez.").font(.caption).foregroundStyle(palette.urgent.color) }
                Button { Task { await desk.stopRecording() } } label: {
                    VText(desk.recordingStop == .pending ? "Arrêt de l’enregistrement…" : "Le prospect refuse l’enregistrement")
                        .frame(maxWidth: .infinity)
                }.venioPrimaryButton().disabled(desk.recordingStop == .pending).accessibilityIdentifier("call.stopRecording")
            }
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
    }

    private var keypad: some View {
        VStack(spacing: 10) {
            Text(verbatim: typed.isEmpty ? " " : typed).font(.title3.monospacedDigit())
            ForEach([["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["*", "0", "#"]], id: \.self) { row in
                HStack(spacing: 18) {
                    ForEach(row, id: \.self) { key in
                        Button { typed += key; desk.sendDigits(key) } label: {
                            Text(verbatim: key).font(.title2).frame(width: 64, height: 52)
                                .background(palette.accent.color.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func control(_ title: String, icon: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon).font(.title2).frame(width: 60, height: 60)
                    .background(on ? palette.accent.color : palette.accent.color.opacity(0.12), in: Circle())
                    .foregroundStyle(on ? Color.white : palette.accentText.color)
                VText(title).font(.caption)
            }
        }.buttonStyle(.plain)
    }
}

/// Résultat de l'appel, saisi comme sur le web : présélectionné par l'état final, relié à l'appel.
struct AfterCallView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.venioSession) private var session
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    @Environment(\.dismiss) private var dismiss
    let desk: CallDesk
    let call: FinishedCall
    @State private var outcome: String?
    @State private var note = ""
    @State private var scriptTag = ""
    @State private var hasNextAction = false
    @State private var nextActionAt = Date.now.addingTimeInterval(86_400)
    @State private var saving = false
    @State private var failed = false
    @State private var saved = false
    @State private var requestId = UUID().uuidString.lowercased()

    private var language: String { locale.language.languageCode?.identifier == "fr" ? "fr" : "en" }
    private var outcomes: [CallOutcome] { desk.settings?.outcomes ?? [] }
    private var selected: CallOutcome? { outcomes.first { $0.value == outcome } }
    private var needsDate: Bool { selected?.effect == "CALLBACK" }
    private var allowsDate: Bool { !["LOST", "DO_NOT_CALL", "WRONG_NUMBER"].contains(selected?.effect ?? "") }

    var body: some View {
        NavigationStack {
            CommercialPage {
                VStack(alignment: .leading, spacing: 6) {
                    Text(verbatim: call.leadName).font(.title2.bold())
                    Text(verbatim: summary).font(.subheadline).foregroundStyle(palette.textSecondary.color)
                }
                if saved {
                    LeadCallStatusView(desk: desk, leadId: call.leadId, callId: call.id)
                    Button { dismiss() } label: { VText("Terminé").frame(maxWidth: .infinity) }.venioPrimaryButton()
                        .accessibilityIdentifier("afterCall.done")
                } else { form }
            }
            .navigationTitle(CommercialStrings.text("Résultat de l’appel", locale: locale))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { if !saved { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { VText("Plus tard") } } } }
        }
        .interactiveDismissDisabled(saving)
        .onAppear {
            outcome = call.record?.suggestedOutcome.flatMap { value in outcomes.contains { $0.value == value } ? value : nil }
            scriptTag = desk.settings?.scriptTags.first ?? ""
        }
    }

    private var summary: String {
        if call.record?.answeredAt != nil || call.elapsedSec > 0, let seconds = call.record?.durationSec ?? (call.elapsedSec > 0 ? call.elapsedSec : nil) {
            return CommercialStrings.format("Appel terminé · %@", locale: locale, Duration.seconds(seconds).formatted(.time(pattern: .minuteSecond)))
        }
        return CommercialStrings.text(call.record?.answeredAt == nil ? "Appel sans réponse" : "Appel terminé", locale: locale)
    }

    @ViewBuilder private var form: some View {
        VStack(alignment: .leading, spacing: 12) {
            VText("Résultat").font(.headline)
            FlowChips(items: outcomes.map { ($0.value, $0.label(language: language)) }, selection: $outcome)
            if let suggested = call.record?.suggestedOutcome, suggested == outcome {
                VText("Présélectionné d’après l’état de l’appel.").font(.caption).foregroundStyle(palette.textSecondary.color)
            }
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
        VStack(alignment: .leading, spacing: 12) {
            VText("Note").font(.headline)
            TextField(CommercialStrings.text("Ce qui a été dit, la suite convenue", locale: locale), text: $note, axis: .vertical)
                .lineLimit(3...6).accessibilityIdentifier("afterCall.note")
            if allowsDate {
                Toggle(isOn: Binding(get: { needsDate || hasNextAction }, set: { hasNextAction = $0 })) { VText(needsDate ? "Date de rappel" : "Prochaine action") }
                    .disabled(needsDate)
                if needsDate || hasNextAction {
                    DatePicker(selection: $nextActionAt, in: Date.now.addingTimeInterval(60)...) { VText("Le") }
                }
            }
            if (desk.settings?.scriptTags.count ?? 0) > 1 {
                Picker(selection: $scriptTag) { ForEach(desk.settings?.scriptTags ?? [], id: \.self) { Text(verbatim: $0).tag($0) } } label: { VText("Script") }
            }
        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
        if failed { VText("Écriture impossible. Réessayez.").foregroundStyle(palette.urgent.color) }
        Button { Task { await save() } } label: { VText("Enregistrer le résultat").frame(maxWidth: .infinity) }
            .venioPrimaryButton().disabled(outcome == nil || saving).accessibilityIdentifier("afterCall.save")
    }

    private func save() async {
        guard let outcome else { return }
        saving = true; failed = false
        defer { saving = false }
        let input = QuickCallInput(clientRequestId: requestId, outcome: outcome, note: note.trimmingCharacters(in: .whitespacesAndNewlines),
                                   scriptTag: scriptTag.isEmpty ? nil : scriptTag,
                                   nextActionAt: allowsDate && (needsDate || hasNextAction) ? nextActionAt : nil, callId: call.id)
        do {
            try await desk.api.quickCall(leadId: call.leadId, input: input)
            saved = true
            // La fiche locale vient de la synchro : la relancer pour voir étape, relance et échange.
            await session?.refresh()
            await store.openLead(id: call.leadId)
        } catch { failed = true }
    }
}

/// Transcript et analyse de l'appel, relus jusqu'à ce qu'ils soient réglés. La validation champ par champ se fait sur le web.
struct LeadCallStatusView: View {
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    @Environment(\.openURL) private var openURL
    let desk: CallDesk
    let leadId: String
    let callId: String
    @State private var call: LeadCall?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label { VText("Résultat enregistré") } icon: { Image(systemName: "checkmark.circle.fill").foregroundStyle(palette.success.color) }
            if let call {
                if let text = CallDeskText.transcript(call) { CommercialBadge(text: CommercialStrings.text(text, locale: locale)).accessibilityIdentifier("afterCall.transcript") }
                if let text = CallDeskText.analysis(call) { CommercialBadge(text: CommercialStrings.text(text, locale: locale), tone: call.analysisStatus == "READY" ? .warning : .accent) }
                if call.analysisStatus == "READY", let url = desk.webLeadURL(leadId) {
                    VText("Chaque champ proposé par l’analyse se valide sur le web, citation à l’appui.").font(.caption).foregroundStyle(palette.textSecondary.color)
                    Button { openURL(url) } label: {
                        Label { VText("Valider l’analyse sur le web") } icon: { Image(systemName: "arrow.up.forward.square") }
                    }.foregroundStyle(palette.accentText.color).accessibilityIdentifier("afterCall.openWeb")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).venioCard()
        .task(id: callId) {
            // Relecture toutes les 5 s, 20 min au plus : le transcript arrive après le rappel de fin de l'opérateur.
            for _ in 0..<240 {
                if let found = try? await desk.api.leadCalls(leadId: leadId).first(where: { $0.id == callId }) {
                    call = found
                    if found.isSettled { return }
                }
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
            }
        }
    }
}

/// Appels récents de la fiche, avec l'état du transcript et de l'analyse.
struct LeadCallsSection: View {
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    let desk: CallDesk
    let leadId: String
    @State private var calls: [LeadCall] = []

    var body: some View {
        // Conteneur toujours présent : un `Group` vide ne s'affiche pas et sa tâche ne partirait jamais.
        VStack(spacing: 0) {
            if !calls.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeading(title: "Appels", count: calls.count)
                    ForEach(calls.prefix(5)) { call in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(verbatim: line(call)).font(.subheadline)
                            HStack {
                                if let text = CallDeskText.transcript(call) { CommercialBadge(text: CommercialStrings.text(text, locale: locale)) }
                                if let text = CallDeskText.analysis(call) { CommercialBadge(text: CommercialStrings.text(text, locale: locale), tone: call.analysisStatus == "READY" ? .warning : .accent) }
                            }
                        }
                        Divider()
                    }
                }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
            }
        }
        .task(id: "\(leadId)-\(desk.finished?.id ?? "")-\(desk.phase.rawValue)") {
            guard desk.phase == .idle else { return }
            calls = (try? await desk.api.leadCalls(leadId: leadId)) ?? calls
        }
    }

    private func line(_ call: LeadCall) -> String {
        let date = call.startedAt.map { CommercialFormats(locale: locale).timestamp($0) } ?? ""
        guard call.answeredAt != nil, let seconds = call.durationSec else { return date + " · " + CommercialStrings.text("Sans réponse", locale: locale) }
        return date + " · " + Duration.seconds(seconds).formatted(.time(pattern: .minuteSecond))
    }
}

/// File d'appels de l'équipe : ses fiches, ou tout son périmètre.
struct CallQueueView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    let desk: CallDesk
    let open: (String) -> Void
    @State private var mine = true
    @State private var leads: [CallQueueLead] = []
    @State private var loaded = false
    @State private var failed = false

    var body: some View {
        CommercialPage {
            Picker(selection: $mine) {
                VText("Mes fiches").tag(true)
                VText("Tout mon périmètre").tag(false)
            } label: { VText("Fiches") }.pickerStyle(.segmented)
            if failed { VText("File indisponible. Réessayez.").foregroundStyle(palette.urgent.color) }
            else if loaded && leads.isEmpty { ContentUnavailableView(CommercialStrings.text("Aucune fiche à appeler", locale: locale), systemImage: "phone") }
            VStack(spacing: 0) {
                ForEach(leads) { lead in
                    HStack(spacing: 12) {
                        Button { open(lead.id) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(verbatim: lead.company).font(.subheadline.weight(.semibold))
                                Text(verbatim: subtitle(lead)).font(.caption).foregroundStyle(palette.textSecondary.color)
                            }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
                        }.buttonStyle(.plain)
                        if desk.canCall {
                            Button { Task { await desk.start(leadId: lead.id, leadName: lead.company) } } label: {
                                Image(systemName: "phone.fill").frame(width: 44, height: 44)
                                    .background(palette.accent.color.opacity(0.12), in: Circle())
                            }.buttonStyle(.plain).disabled(desk.busy)
                                .accessibilityLabel(Text(verbatim: CommercialStrings.format("Appeler %@", locale: locale, lead.company)))
                                .accessibilityIdentifier("queue.call.\(lead.id)")
                        }
                    }.padding(.vertical, 10)
                    Divider()
                }
            }.venioCard()
        }
        .navigationTitle(CommercialStrings.text("File d’appels", locale: locale))
        .refreshable { await load() }
        .task(id: "\(mine)-\(desk.finished == nil)") { await load() }
    }

    private func load() async {
        do { leads = try await desk.api.queue(mine: mine); failed = false } catch { failed = true }
        loaded = true
    }

    private func subtitle(_ lead: CallQueueLead) -> String {
        let language = locale.language.languageCode?.identifier == "fr" ? "fr" : "en"
        var parts = [lead.contactName ?? ""]
        if let value = lead.lastCallOutcome, let outcome = desk.settings?.outcomes.first(where: { $0.value == value }) {
            parts.append(outcome.label(language: language))
        }
        if let date = lead.lastCallAt { parts.append(CommercialFormats(locale: locale).date(date)) }
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

/// Puces à choix unique qui passent à la ligne.
struct FlowChips: View {
    @Environment(\.venioPalette) private var palette
    let items: [(value: String, label: String)]
    @Binding var selection: String?
    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(items, id: \.value) { item in
                let on = selection == item.value
                Button { selection = item.value } label: {
                    Text(verbatim: item.label).font(.subheadline.weight(on ? .semibold : .regular))
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .foregroundStyle(on ? Color.white : palette.accentText.color)
                        .background(on ? palette.accent.color : palette.accent.color.opacity(0.12), in: Capsule())
                }.buttonStyle(.plain).accessibilityAddTraits(on ? .isSelected : []).accessibilityIdentifier("outcome.\(item.value)")
            }
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        rows(proposal.width ?? .infinity, subviews).last.map { CGSize(width: proposal.width ?? $0.width, height: $0.maxY) } ?? .zero
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            subview.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
            x += size.width + spacing; rowHeight = max(rowHeight, size.height)
        }
    }
    private func rows(_ width: CGFloat, _ subviews: Subviews) -> [(width: CGFloat, maxY: CGFloat)] {
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        var result: [(CGFloat, CGFloat)] = []
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { y += rowHeight + spacing; x = 0; rowHeight = 0 }
            x += size.width + spacing; rowHeight = max(rowHeight, size.height); widest = max(widest, x - spacing)
            result.append((widest, y + rowHeight))
        }
        return result
    }
}
#endif
