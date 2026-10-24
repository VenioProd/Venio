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
