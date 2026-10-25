#if !os(watchOS)
import SwiftUI
import VenioCore
import VenioTheme

struct LeadFollowUpSheet: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.dismiss) private var dismiss
    @State private var date: Date
    @State private var busy = false
    @State private var errorKey: String?
    let lead: Lead
    let clock: DemoClock

    init(lead: Lead, clock: DemoClock) {
        self.lead = lead
        self.clock = clock
        let tomorrow = clock.calendar.date(byAdding: .day, value: 1, to: clock.now)!
        let defaultDate = clock.calendar.date(bySettingHour: 9, minute: 0, second: 0, of: tomorrow)!
        _date = State(initialValue: lead.nextActionAt.flatMap { $0 > clock.now ? $0 : nil } ?? defaultDate)
    }

    var body: some View {
        NavigationStack {
            CommercialPage {
                DatePicker(CommercialStrings.text("Date et heure", locale: locale), selection: $date,
                           in: clock.now.addingTimeInterval(1)..., displayedComponents: [.date, .hourAndMinute])
                    .accessibilityIdentifier("followUp.date")
                Button { date = morning(afterDays: 1) } label: { VText("Demain 9 h") }
                Button { date = clock.calendar.date(byAdding: .day, value: 3, to: clock.now)! } label: { VText("Dans 3 jours") }
                Button {
                    let weekday = clock.calendar.component(.weekday, from: clock.now)
                    let days = (2 - weekday + 7) % 7
                    date = morning(afterDays: days == 0 ? 7 : days)
                } label: { VText("Lundi prochain 9 h") }
                if let errorKey { MobileErrorView(key: errorKey) }
                Button { save(.set(date)) } label: {
                    if busy { ProgressView() } else { VText("Enregistrer") }
                }.venioPrimaryButton().accessibilityIdentifier("followUp.save").disabled(date <= clock.now)
                if lead.nextActionAt != nil {
                    Button(role: .destructive) { save(.clear) } label: { VText("Effacer la relance") }
                        .accessibilityIdentifier("followUp.clear")
                }
            }
            .disabled(busy)
            .navigationTitle(CommercialStrings.text("Relance", locale: locale))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { VText("Fermer") }.disabled(busy) } }
        }
        .environment(\.calendar, clock.calendar)
        .environment(\.timeZone, clock.calendar.timeZone)
        .interactiveDismissDisabled(busy)
    }

    private func morning(afterDays days: Int) -> Date {
        let day = clock.calendar.date(byAdding: .day, value: days, to: clock.now)!
        return clock.calendar.date(bySettingHour: 9, minute: 0, second: 0, of: day)!
    }
    private func save(_ followUp: LeadPatch.FollowUp) {
        if case .set(let date) = followUp, date <= clock.now { return }
        busy = true
        errorKey = nil
        Task {
            defer { busy = false }
            do {
                try await store.updateLead(id: lead.id, patch: LeadPatch(nextActionAt: followUp))
                dismiss()
            } catch { errorKey = mobileErrorKey(error) }
        }
    }
}

struct LeadStageSheet: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.dismiss) private var dismiss
    @State private var stage: LeadStage?
    @State private var reasons: [String] = []
    @State private var reason = ""
    @State private var busy = false
    @State private var loading = true
    @State private var errorKey: String?
    let lead: Lead

    var body: some View {
        NavigationStack {
            CommercialPage {
                ForEach(LeadStage.allCases.filter { $0 != lead.status }, id: \.self) { option in
                    Button { stage = option } label: {
                        HStack {
                            VText(option.label)
                            Spacer()
                            if stage == option { Image(systemName: "checkmark").accessibilityLabel(CommercialStrings.text("Sélectionné", locale: locale)) }
                        }.contentShape(Rectangle())
                    }.accessibilityIdentifier("stage.option." + option.rawValue)
                        .disabled(option == .lost && reasons.isEmpty)
                }
                if loading { ProgressView() }
                else if reasons.isEmpty { VText("Perdu indisponible : aucun motif de perte disponible.").font(.caption) }
                if stage == .lost {
                    Picker(CommercialStrings.text("Motif de perte", locale: locale), selection: $reason) {
                        VText("Choisir un motif").tag("")
                        ForEach(reasons, id: \.self) { value in
                            Text(verbatim: CommercialStrings.text(value, locale: locale)).tag(value)
                        }
                    }.accessibilityIdentifier("stage.lostReason")
                }
                if let errorKey { MobileErrorView(key: errorKey) }
                Button { save() } label: {
                    if busy { ProgressView() } else { VText("Enregistrer") }
                }.venioPrimaryButton().accessibilityIdentifier("stage.save")
                    .disabled(stage == nil || (stage == .lost && !reasons.contains(reason)))
            }
            .disabled(busy)
            .navigationTitle(CommercialStrings.text("Étape", locale: locale))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { VText("Fermer") }.disabled(busy) } }
        }.interactiveDismissDisabled(busy)
            .task {
                defer { loading = false }
                do { reasons = try await store.lostReasons().filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } }
                catch { errorKey = mobileErrorKey(error) }
            }
    }

    private func save() {
        guard let stage, stage != .lost || reasons.contains(reason) else { return }
        busy = true
        errorKey = nil
        Task {
            defer { busy = false }
            do {
                try await store.updateLead(id: lead.id, patch: LeadPatch(status: stage, lostReason: stage == .lost ? reason : nil))
                dismiss()
            } catch { errorKey = mobileErrorKey(error) }
        }
    }
}
#endif
