import SwiftUI
import VenioCore
import VenioTheme

struct WidgetAppearance {
    let snapshot: WidgetSnapshot
    var locale: Locale { Locale(identifier: snapshot.language == "en" ? "en_US" : "fr_FR") }
    var palette: ThemePalette {
        ThemePalette(ThemeSelection(theme: ThemeKind(rawValue: snapshot.theme) ?? .glass,
            background: snapshot.background, accent: snapshot.accent, locale: snapshot.language))
    }
    func text(_ key: String) -> String {
        let language = snapshot.language == "en" ? "en" : "fr"
        let bundle = Bundle.main.path(forResource: language, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
        return bundle.localizedString(forKey: key, value: nil, table: "Localizable")
    }
    func money(_ amount: Decimal) -> String {
        amount.formatted(.currency(code: "EUR").precision(.fractionLength(0)).locale(locale))
    }
    func time(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = TimeZone(identifier: "Europe/Paris")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}
