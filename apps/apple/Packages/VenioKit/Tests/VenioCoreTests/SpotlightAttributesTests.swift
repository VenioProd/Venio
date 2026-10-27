import Foundation
import Testing
@testable import VenioCore

@Test func spotlightAttributesExcludePrivateData() {
    let lead = Lead(id: "lead", company: "Société visible", contactName: "Camille Roussel",
        contactEmail: "secret@example.com", contactPhone: "+33698765432", status: .lead, budget: 987654,
        nextActionAt: nil, serviceType: "Conseil", leadTemperature: .warm, assignedTo: "user", score: nil,
        notes: "NOTE_CONFIDENTIELLE", createdAt: .distantPast)
    let project = Project(id: "project", projectNumber: "V-042", name: "Projet visible", client: "Client visible",
        status: .active, budget: ProjectBudget(amount: 765432),
        billing: ProjectBilling(amountInvoiced: 654321, billingStatus: .partial), endDate: nil, progress: 0)
    let attributes = [SpotlightAttributes(lead: lead), SpotlightAttributes(project: project)]
    let indexedText = attributes.map { [$0.title, $0.summary] + $0.keywords }.flatMap { $0 }.joined(separator: " ")
    #expect(indexedText.contains("Société visible"))
    #expect(indexedText.contains("Camille Roussel"))
    #expect(indexedText.contains("Conseil"))
    #expect(indexedText.contains("Client visible"))
    #expect(indexedText.contains("Projet visible"))
    #expect(indexedText.contains("V-042"))
    #expect(!indexedText.contains("987654"))
    #expect(!indexedText.contains("765432"))
    #expect(!indexedText.contains("654321"))
    #expect(!indexedText.contains(lead.notes))
    #expect(!indexedText.contains(lead.contactPhone))
    #expect(!indexedText.contains(lead.contactEmail))
}
