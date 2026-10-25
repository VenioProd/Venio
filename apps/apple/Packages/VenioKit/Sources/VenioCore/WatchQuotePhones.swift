import Foundation

public struct WatchQuotePhone: Codable, Sendable {
    public var quoteID: String
    public var projectID: String?
    public var leadID: String?
    public var phone: String
    public var projectHasSingleLead: Bool
}

public enum WatchQuotePhones {
    public static func snapshot(quotes: [QuoteProposal], leads: [Lead]) -> [WatchQuotePhone] {
        let phones = quotes.filter { $0.status == .sent && $0.signature.signedAt == nil }.map { quote in
            let lead: Lead?
            if let id = quote.leadId, let linked = leads.first(where: { $0.id == id }) {
                lead = linked
            } else if let client = quote.client, !client.isEmpty {
                let matches = leads.filter { $0.clientAccountId == client || $0.company == client }
                lead = matches.count == 1 ? matches.first : nil
            } else { lead = nil }
            return WatchQuotePhone(quoteID: quote.id, projectID: quote.project, leadID: lead?.id, phone: lead?.contactPhone ?? "", projectHasSingleLead: false)
        }
        let projects = Dictionary(grouping: phones, by: \.projectID)
        // La limite ne doit pas masquer un autre lead du même projet.
        return phones.prefix(50).map { phone in
            var phone = phone
            let matches = projects[phone.projectID, default: []]
            phone.projectHasSingleLead = matches.allSatisfy { $0.leadID != nil } && Set(matches.compactMap(\.leadID)).count == 1
            return phone
        }
    }

    public static func phoneURL(for link: DeepLink?, in phones: [WatchQuotePhone]) -> URL? {
        let matches: [WatchQuotePhone]
        switch link {
        case .quote(let id): matches = phones.filter { $0.quoteID == id }
        case .projectQuotes(let id):
            matches = phones.filter { $0.projectID == id }
            guard matches.allSatisfy(\.projectHasSingleLead) else { return nil }
        default: return nil
        }
        guard !matches.isEmpty, matches.allSatisfy({ $0.leadID != nil }),
              Set(matches.compactMap(\.leadID)).count == 1, let phone = matches.first?.phone else { return nil }
        let digits = phone.filter(\.isNumber)
        guard !digits.isEmpty else { return nil }
        let prefix = phone.trimmingCharacters(in: .whitespaces).hasPrefix("+") ? "+" : ""
        return URL(string: "tel:" + prefix + digits)
    }
}
