import Foundation
import SwiftUI
import VenioCore

// Le bundle explicite permet de changer de langue sans relancer l'app.
enum CommercialStrings {
    static func text(_ key: String, locale: Locale) -> String {
        let language = locale.language.languageCode?.identifier == "fr" ? "fr" : "en"
        let bundle = Bundle.module.path(forResource: language, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .module
        return bundle.localizedString(forKey: key, value: key, table: "Localizable")
    }

    static func format(_ key: String, locale: Locale, _ arguments: CVarArg...) -> String {
        String(format: text(key, locale: locale), locale: locale, arguments: arguments)
    }
}

struct VText: View {
    @Environment(\.locale) private var locale
    let key: String
    nonisolated init(_ key: String) { self.key = key }
    var body: some View { Text(verbatim: CommercialStrings.text(key, locale: locale)) }
}

struct CommercialFormats {
    let locale: Locale
    static let timeZone = TimeZone(identifier: "Europe/Paris")!

    func money(_ amount: Decimal?) -> String {
        (amount ?? 0).formatted(.currency(code: "EUR").precision(.fractionLength(0)).locale(locale))
    }

    func number(_ value: Int) -> String { value.formatted(.number.locale(locale)) }
    func percent(_ value: Decimal) -> String { value.formatted(.percent.precision(.fractionLength(0)).locale(locale)) }

    func date(_ value: Date, template: String = "dMMM") -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = Self.timeZone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: value)
    }

    func dayHeading(_ value: Date) -> String {
        let text = date(value, template: "EEEEdMMMM")
        return text.prefix(1).uppercased(with: locale) + text.dropFirst()
    }

    func timestamp(_ value: Date) -> String { date(value) + " · " + time(value) }
    func time(_ value: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = Self.timeZone
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: value)
    }

    func followUp(_ value: Date, clock: DemoClock) -> String {
        if clock.calendar.isDate(value, inSameDayAs: clock.now) {
            return CommercialStrings.format("Relance aujourd’hui · %@", locale: locale, time(value))
        }
        return CommercialStrings.format("Relance du %@", locale: locale, date(value))
    }

    func countdown(to date: Date, from now: Date) -> String {
        let minutes = Int(date.timeIntervalSince(now) / 60)
        if minutes < 0 { return CommercialStrings.text("En retard", locale: locale) }
        return CommercialStrings.format("Dans %lld min", locale: locale, minutes)
    }
}

extension LeadStage {
    var label: String {
        switch self {
        case .lead: "Lead"
        case .qualified: "Qualifié"
        case .contacted: "Contacté"
        case .demo: "Démo"
        case .proposal: "Proposition"
        case .won: "Gagné"
        case .lost: "Perdu"
        }
    }
}

extension LeadTemperature {
    var label: String {
        switch self {
        case .cold: "Froid"
        case .warm: "Tiède"
        case .hot: "Chaud"
        case .veryHot: "Très chaud"
        }
    }
}

extension Lead {
    var initials: String { company.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined() }
    public var phoneURL: URL? {
        let digits = contactPhone.filter(\.isNumber)
        guard !digits.isEmpty else { return nil }
        let normalized = contactPhone.trimmingCharacters(in: .whitespaces).hasPrefix("+") ? "+" + digits : digits
        return URL(string: "tel:" + normalized)
    }
    var emailURL: URL? {
        guard !contactEmail.isEmpty else { return nil }
        var components = URLComponents()
        components.scheme = "mailto"
        components.path = contactEmail
        return components.url
    }
}
