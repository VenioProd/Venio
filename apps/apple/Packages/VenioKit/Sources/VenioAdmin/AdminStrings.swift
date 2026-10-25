#if !os(watchOS)
import SwiftUI

// Le bundle de langue explicite suit les réglages sans relancer l’app.
enum AdminStrings {
    static func text(_ key: String, locale: Locale) -> String {
        let language = locale.language.languageCode?.identifier == "fr" ? "fr" : "en"
        let bundle = Bundle.module.path(forResource: language, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .module
        return bundle.localizedString(forKey: key, value: key, table: "Localizable")
    }
    static func format(_ key: String, locale: Locale, _ arguments: CVarArg...) -> String {
        String(format: text(key, locale: locale), locale: locale, arguments: arguments)
    }
}

struct AdminText: View {
    @Environment(\.locale) private var locale
    let key: String
    nonisolated init(_ key: String) { self.key = key }
    var body: some View { Text(verbatim: AdminStrings.text(key, locale: locale)) }
}

extension AdminAPIError {
    var messageKey: String {
        switch self {
        case .webOnly: "Cette donnée n'est pas encore ouverte à l'app."
        case .forbidden: "Accès non autorisé"
        case .notFound: "Cet élément est introuvable."
        case .connectionRequired: "Une connexion est nécessaire."
        case .invalidInput: "Vérifiez les informations saisies."
        case .other: "Impossible de charger les données. Réessayez."
        case .conflict(let code):
            switch code {
            case "INVALID_TRANSITION": "Cette action n’est plus possible dans l’état actuel."
            case "PHASE_LOCKED": "La phase précédente doit être validée par le client."
            case "CLIENT_VALIDATION_REQUIRED": "Demandez la validation du client pour terminer cette phase."
            case "VALIDATION_NOT_REQUIRED": "Cette phase ne nécessite pas de validation client."
            case "VALIDATED_PHASE_IMMUTABLE": "Une phase validée par le client ne peut plus être modifiée."
            default: "Les données ont changé. Actualisez avant de réessayer."
            }
        }
    }
}
#endif
