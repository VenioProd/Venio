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
    var highlight = false
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).foregroundStyle(urgent ? palette.urgent.color : palette.accentText.color)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text(verbatim: lead.company).font(.headline)
                if let subtitle { Text(verbatim: subtitle).font(.subheadline).foregroundStyle(palette.textSecondary.color) }
                else {
                    Text(verbatim: lead.contactName + " · " + CommercialStrings.text(lead.serviceType, locale: locale))
                        .font(.subheadline).foregroundStyle(palette.textSecondary.color)
                }
                ViewThatFits(in: .horizontal) {
                    HStack { metadata }
                    VStack(alignment: .leading) { metadata }
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .venioCard()
        .overlay {
            if highlight { RoundedRectangle(cornerRadius: 22).strokeBorder(palette.accent.color.opacity(0.5), lineWidth: 1) }
        }
    }
    @ViewBuilder private var metadata: some View {
        Text(verbatim: CommercialFormats(locale: locale).money(lead.budget)).font(.subheadline.weight(.semibold).monospacedDigit())
        if showsAssignee {
            Text(verbatim: store.initials(lead.assignedTo)).font(.caption.bold())
                .accessibilityLabel(Text(verbatim: store.userName(lead.assignedTo) ?? CommercialStrings.text("Non assigné", locale: locale)))
        }
        if let badge { CommercialBadge(text: badge, tone: urgent ? .urgent : .accent) }
    }
}

struct CommercialPage<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) { content }
                .padding().frame(maxWidth: 1000).frame(maxWidth: .infinity)
        }
        .background { ThemedBackground() }
    }
}
