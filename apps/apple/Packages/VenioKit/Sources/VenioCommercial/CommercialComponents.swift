import SwiftUI
import VenioCore
import VenioTheme

struct CommercialBadge: View {
    @Environment(\.venioPalette) private var palette
    let text: String
    var tone: Tone = .accent
    enum Tone { case accent, urgent, success, warning }
    private var color: Color {
        switch tone {
        case .accent: palette.accentText.color
        case .urgent: palette.urgent.color
        case .success: palette.success.color
        case .warning: palette.warning.color
        }
    }
    var body: some View {
        Text(verbatim: text).font(.caption.weight(.semibold))
            .padding(.horizontal, 8).padding(.vertical, 5)
            .foregroundStyle(color).background(color.opacity(0.12), in: Capsule())
            .accessibilityLabel(Text(verbatim: text))
    }
}

struct SectionHeading: View {
    @Environment(\.locale) private var locale
    let title: String
    let count: Int
    var body: some View {
        HStack {
            VText(title).font(.headline)
            Spacer()
            Text(verbatim: CommercialFormats(locale: locale).number(count)).font(.subheadline.monospacedDigit())
        }
        .accessibilityElement(children: .combine)
    }
}

struct LeadRow: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    let lead: Lead
    var subtitle: String? = nil
    var badge: String? = nil
    var icon: String = "building.2"
    var urgent = false
    var showsAssignee = false
    var dense = false
    var body: some View {
        HStack(spacing: dense ? 8 : 10) {
            Image(systemName: icon)
                .font(.body.weight(.semibold))
                .foregroundStyle(urgent ? palette.urgent.color : palette.accentText.color)
                .frame(width: dense ? 32 : 34, height: dense ? 32 : 34)
                .background((urgent ? palette.urgent.color : palette.accent.color).opacity(0.12),
                            in: RoundedRectangle(cornerRadius: dense ? 8 : 10))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(verbatim: lead.company).font(.subheadline.weight(.semibold))
                Text(verbatim: subtitle ?? (lead.contactName + " · " + CommercialStrings.text(lead.serviceType, locale: locale)))
                    .font(.caption).foregroundStyle(palette.textSecondary.color)
            }.frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                Text(verbatim: CommercialFormats(locale: locale).money(lead.budget))
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .contentTransition(.numericText())
                    .animation(.smooth, value: lead.budget)
                if let state = lead.deliveryState {
                    CommercialBadge(text: CommercialStrings.text(state == "failed" ? "Échec de l’envoi" : "En attente", locale: locale))
                }
                if let badge { CommercialBadge(text: badge, tone: urgent ? .urgent : .accent) }
                else if showsAssignee {
                    CommercialBadge(text: store.initials(lead.assignedTo))
                        .accessibilityLabel(Text(verbatim: store.userName(lead.assignedTo) ?? CommercialStrings.text("Non assigné", locale: locale)))
                }
            }.fixedSize(horizontal: true, vertical: false)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, dense ? 8 : 10)
        .contentShape(Rectangle())
    }
}

struct CommercialPage<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) { content }
                .padding().frame(maxWidth: 1000).frame(maxWidth: .infinity)
        }
        .background { ThemedBackground() }
    }
}
