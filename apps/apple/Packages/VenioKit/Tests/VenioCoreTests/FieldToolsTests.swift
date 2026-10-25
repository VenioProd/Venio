import Testing
@testable import VenioCore

@Test func frenchBusinessCard() {
    let card = BusinessCardParser.parse(lines: ["Hôtel Mirabeau", "Camille Roussel", "Directrice", "06 12 34 56 78", "c.roussel@hotel-mirabeau.fr", "www.hotel-mirabeau.fr"])
    #expect(card.company == "Hôtel Mirabeau")
    #expect(card.contactName == "Camille Roussel")
    #expect(card.jobTitle == "Directrice")
    #expect(card.contactPhone == "06 12 34 56 78")
    #expect(card.contactEmail == "c.roussel@hotel-mirabeau.fr")
    #expect(card.website == "www.hotel-mirabeau.fr")
}

@Test func englishBusinessCard() {
    let card = BusinessCardParser.parse(lines: ["NORTHBRIDGE STUDIO", "Oliver Bennett", "Sales Director", "+44 20 7946 0958", "oliver@northbridge.co.uk", "https://northbridge.co.uk"])
    #expect(card.company == "NORTHBRIDGE STUDIO")
    #expect(card.contactName == "Oliver Bennett")
    #expect(card.jobTitle == "Sales Director")
    #expect(card.contactPhone == "+44 20 7946 0958")
    #expect(card.contactEmail == "oliver@northbridge.co.uk")
    #expect(card.website == "https://northbridge.co.uk")
}

@Test func leadDeepLink() {
    #expect(DeepLink.parse(type: "CRM_LEAD_ASSIGNED", link: "/admin/crm/leads/lead-calder") == .lead("lead-calder"))
}
@Test func quoteDeepLink() {
    #expect(DeepLink.parse(type: "QUOTE_PROPOSAL_VIEWED", link: "/admin/projets/project-pilote") == .projectQuotes("project-pilote"))
}
@Test func projectDeepLink() {
    #expect(DeepLink.parse(type: "PHASE_VALIDATED", link: "/admin/projets/project-riviere?tab=phases") == .project("project-riviere"))
}
@Test func unknownDeepLink() {
    #expect(DeepLink.parse(type: "UNKNOWN", link: "/admin/projets/project-pilote") == nil)
}

@Test func watchQuotePhoneResolutionUsesLeadIdentity() async throws {
    let api = MockVenioAPI()
    var leads = try await api.leads().filter { $0.id == "lead-calder" }
    var quote = try #require(try await api.quotes().first { $0.id == "quote-041" })
    let direct = WatchQuotePhones.snapshot(quotes: [quote], leads: leads)
    #expect(WatchQuotePhones.phoneURL(for: .quote(quote.id), in: direct)?.absoluteString == "tel:+33600000001")
    quote.leadId = nil
    let fallback = WatchQuotePhones.snapshot(quotes: [quote], leads: leads)
    #expect(WatchQuotePhones.phoneURL(for: .projectQuotes("project-calder"), in: fallback) != nil)
    var other = try #require(leads.first)
    other.id = "other-lead"
    leads.append(other)
    #expect(WatchQuotePhones.phoneURL(for: .quote(quote.id), in: WatchQuotePhones.snapshot(quotes: [quote], leads: leads)) == nil)
    quote.leadId = leads[0].id
    var second = quote
    second.id = "other-quote"
    second.leadId = other.id
    let ambiguous = WatchQuotePhones.snapshot(quotes: [quote, second], leads: leads)
    #expect(WatchQuotePhones.phoneURL(for: .quote(quote.id), in: ambiguous) != nil)
    #expect(WatchQuotePhones.phoneURL(for: .projectQuotes("project-calder"), in: ambiguous) == nil)
    quote.status = .signed
    #expect(WatchQuotePhones.snapshot(quotes: [quote], leads: leads).isEmpty)
}
