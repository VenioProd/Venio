import Foundation
import Testing
@testable import VenioCore

@Test func messageTemplateRendering() {
    let template = MessageTemplate(id: "exchange", subject: "Pour {{company}}", body: "Bonjour {{firstName}}, {{company}} — {{sender}}")
    let rendered = template.rendered(contactName: "  Camille Roussel  ", company: "Mirabeau", sender: "Léa Martin", missingFirstName: "à vous")
    #expect(rendered.subject == "Pour Mirabeau")
    #expect(rendered.body == "Bonjour Camille, Mirabeau — Léa Martin")
    #expect(template.rendered(contactName: " \n ", company: "Mirabeau", sender: "Léa", missingFirstName: "à vous").body == "Bonjour à vous, Mirabeau — Léa")
}
