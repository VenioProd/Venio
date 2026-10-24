import Foundation

public struct BusinessCard: Sendable {
    public var company = ""
    public var contactName = ""
    public var jobTitle = ""
    public var contactPhone = ""
    public var contactEmail = ""
    public var website = ""
}

public enum BusinessCardParser {
    public static func parse(lines: [String]) -> BusinessCard {
        var card = BusinessCard()
        var remaining: [String] = []
        for line in lines.map({ $0.trimmingCharacters(in: .whitespacesAndNewlines) }) where !line.isEmpty {
            if let email = match(#"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}"#, in: line) {
                if card.contactEmail.isEmpty { card.contactEmail = email }
            } else if let phone = match(#"(?:\+\d{1,3}[\s.\-]?(?:\(0\)[\s.\-]?)?|0)\d(?:[\s.\-]?\d){8,12}"#, in: line) {
                if card.contactPhone.isEmpty { card.contactPhone = phone }
            } else if let website = match(#"(?:https?://|www\.)[^\s]+|\b[A-Z0-9\-]+\.(?:com|fr|co\.uk|net|org)\b"#, in: line) {
                if card.website.isEmpty { card.website = website }
            } else { remaining.append(line) }
        }
        // L'OCR fournit les lignes dans l'ordre visuel ; l'en-tête est le repli pour l'entreprise.
        if let index = remaining.firstIndex(where: { $0 == $0.uppercased() && $0 != $0.lowercased() }) {
            card.company = remaining.remove(at: index)
        } else if !remaining.isEmpty { card.company = remaining.removeFirst() }
        if let index = remaining.firstIndex(where: { line in
            let words = line.split(separator: " ")
            return words.count == 2 && words.allSatisfy { $0.first?.isUppercase == true }
        }) { card.contactName = remaining.remove(at: index) }
        card.jobTitle = remaining.first ?? ""
        return card
    }

    private static func match(_ pattern: String, in text: String) -> String? {
        guard let range = text.range(of: pattern, options: [.regularExpression, .caseInsensitive]) else { return nil }
        return String(text[range])
    }
}
