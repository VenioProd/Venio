import Foundation

public struct MockVenioAPI: VenioAPI {
    public static let lea = UserSummary(id: "user-lea", name: "Léa Martin", initials: "LM", role: .commercial)
    public static let hugo = UserSummary(id: "user-hugo", name: "Hugo Bernard", initials: "HB", role: .commercial)
    public static let raphael = UserSummary(id: "user-raphael", name: "Raphaël B.", initials: "RB", role: .admin)
    public let clock: DemoClock
    private let user: UserSummary

    public init(clock: DemoClock = DemoClock(), user: UserSummary = Self.lea) {
        self.clock = clock
        self.user = user
    }

    public func currentUser() async throws -> UserSummary { user }

    public func leads() async throws -> [Lead] {
        let lea = Self.lea.id
        let hugo = Self.hugo.id
        return [
            Lead(id: "lead-calder", company: "Maison Calder", contactName: "Claire Calder", contactEmail: "claire@maison-calder.example", contactPhone: "+33 6 00 00 00 01", source: "Scan de carte de visite — Vivatech Paris", status: .proposal, budget: 14800, nextActionAt: DemoClock.date(23, hour: 10, minute: 30), serviceType: "Site vitrine + SEO", leadTemperature: .veryHot, assignedTo: lea, score: 86, notes: "La cliente souhaite revoir la proposition la semaine prochaine.", createdAt: DemoClock.date(13, hour: 17, minute: 48)),
            Lead(id: "lead-nova", company: "Atelier Nova", contactName: "Malik Benali", status: .demo, budget: 22500, nextActionAt: DemoClock.date(23, hour: 14), serviceType: "E-commerce", leadTemperature: .hot, assignedTo: lea, score: 74, createdAt: DemoClock.date(10)),
            Lead(id: "lead-ferrand", company: "Cabinet Ferrand Avocats", contactName: "Sophie Ferrand", contactEmail: "sophie@ferrand.example", contactPhone: "+33 6 00 00 00 02", status: .contacted, budget: 9600, nextActionAt: DemoClock.date(21), serviceType: "Site + espace client", leadTemperature: .warm, assignedTo: lea, score: 58, createdAt: DemoClock.date(10)),
            Lead(id: "lead-halles", company: "Brasserie Les Halles", contactName: "Julien Roux", status: .qualified, budget: 6400, nextActionAt: nil, serviceType: "Site + réservation", leadTemperature: .hot, assignedTo: lea, score: 69, createdAt: DemoClock.date(10)),
            Lead(id: "lead-okami", company: "Studio Okami", contactName: "Yuki Tanaka", source: "Formulaire du site", status: .lead, budget: 38000, nextActionAt: nil, serviceType: "App mobile", leadTemperature: .warm, assignedTo: nil, score: 41, notes: "We would like to discuss the mobile app requirements next week.", createdAt: DemoClock.date(23, hour: 8, minute: 52)),
            Lead(id: "lead-aubin", company: "Clinique Saint-Aubin", contactName: "Dr Paul Aubin", status: .proposal, budget: 31000, nextActionAt: DemoClock.date(26), serviceType: "Plateforme de RDV", leadTemperature: .hot, assignedTo: hugo, score: 80, createdAt: DemoClock.date(10)),
            Lead(id: "lead-verlaine", company: "Domaine Verlaine", contactName: "Anne Verlaine", status: .contacted, budget: 12000, nextActionAt: DemoClock.date(27), serviceType: "E-commerce vins", leadTemperature: .cold, assignedTo: hugo, score: 35, createdAt: DemoClock.date(10)),
            Lead(id: "lead-arcadie", company: "Fondation Arcadie", contactName: "Marc Delorme", contactEmail: "marc@arcadie.example", contactPhone: "+33 6 00 00 00 03", status: .demo, budget: 18200, nextActionAt: DemoClock.date(23, hour: 16), serviceType: "Refonte de site", leadTemperature: .warm, assignedTo: lea, score: 62, createdAt: DemoClock.date(10))
        ]
    }

    public func lead(id: String) async throws -> Lead {
        guard let result = try await leads().first(where: { $0.id == id }) else { throw MockError.notFound }
        return result
    }

    public func timeline(leadId: String) async throws -> [TimelineEntry] {
        _ = try await lead(id: leadId)
        if leadId == "lead-okami" {
            return TimelineEntry.merged(activities: [], interactions: [Interaction(id: "okami-note", subjectType: .lead, subjectId: leadId, kind: .note, direction: .incoming, occurredAt: DemoClock.date(23, hour: 9), subject: "Project requirements", body: "Please send the proposal in English before our next meeting.", author: Self.lea.id)])
        }
        guard leadId == "lead-calder" else { return [] }
        let activities = [
            LeadActivity(id: "calder-viewed", leadId: leadId, type: "QUOTE_VIEWED", label: "La cliente a ouvert le devis DV-2026-041", actorId: nil, createdAt: DemoClock.date(22, hour: 18, minute: 12)),
            LeadActivity(id: "calder-sent", leadId: leadId, type: "QUOTE_SENT", label: "Devis DV-2026-041 envoyé par Léa", actorId: Self.lea.id, createdAt: DemoClock.date(20, hour: 11, minute: 5)),
            LeadActivity(id: "calder-stage", leadId: leadId, type: "STATUS_CHANGE", label: "Passage de Qualifié à Contacté", actorId: Self.lea.id, createdAt: DemoClock.date(14, hour: 9, minute: 20)),
            LeadActivity(id: "calder-created", leadId: leadId, type: "CREATED", label: "Lead créé depuis un scan de carte de visite — salon Vivatech Paris", actorId: Self.lea.id, createdAt: DemoClock.date(13, hour: 17, minute: 48))
        ]
        let interactions = [Interaction(id: "calder-discovery", subjectType: .lead, subjectId: leadId, kind: .meeting, direction: .none, occurredAt: DemoClock.date(17, hour: 15, minute: 30), subject: "RDV de découverte", body: "Note vocale de 2 min 14, transcrite", author: Self.lea.id)]
        return TimelineEntry.merged(activities: activities, interactions: interactions)
    }

    public func quotes() async throws -> [QuoteProposal] {
        [
            quote("041", client: "Maison Calder", project: "project-calder", template: "Site vitrine", amount: 14800, status: .sent, viewedAt: DemoClock.date(22, hour: 18, minute: 12)),
            quote("039", client: "Clinique Saint-Aubin", project: "project-aubin", template: "Plateforme sur mesure", amount: 31000, status: .sent, author: Self.hugo.id),
            quote("038", client: "Agence Pilote", project: "project-pilote", template: "Plateforme sur mesure", amount: 18400, status: .signed, signedAt: DemoClock.date(9)),
            quote("036", client: "Boulangerie Rivière", project: "project-riviere", template: "E-commerce", amount: 8900, status: .signed, signedAt: DemoClock.date(2)),
            quote("033", client: "Garage Mercier", project: "project-mercier", template: "Site vitrine", amount: 5200, status: .expired)
        ]
    }

    private func quote(_ number: String, client: String, project: String, template: String, amount: Decimal, status: QuoteStatus, viewedAt: Date? = nil, signedAt: Date? = nil, author: String = Self.lea.id) -> QuoteProposal {
        QuoteProposal(id: "quote-\(number)", project: project, client: client, createdBy: author, title: template, status: status, lines: [QuoteLine(description: template, quantity: 1, unitPrice: amount)], signature: QuoteSignature(signedAt: signedAt), viewedAt: viewedAt, reference: "DV-2026-\(number)")
    }

    public func appointments() async throws -> [Appointment] {
        [Appointment(id: "appointment-nova", leadId: "lead-nova", title: "Démo d’Atelier Nova", startsAt: DemoClock.date(23, hour: 14), assignedTo: Self.lea.id, location: "Visio")]
    }

    public func projects() async throws -> [Project] {
        [
            Project(id: "project-pilote", projectNumber: "P-2026-018", name: "Plateforme de réservation", client: "Agence Pilote", status: .active, budget: ProjectBudget(amount: 18400), billing: ProjectBilling(amountInvoiced: 9200, billingStatus: .partial), endDate: DemoClock.date(28, month: 11), progress: 62),
            Project(id: "project-riviere", projectNumber: "P-2026-015", name: "Site + click & collect", client: "Boulangerie Rivière", status: .active, budget: ProjectBudget(amount: 8900), billing: ProjectBilling(amountInvoiced: 4450, billingStatus: .partial), endDate: DemoClock.date(6, month: 11), progress: 85),
            Project(id: "project-morel", projectNumber: "P-2026-011", name: "Espace client", client: "Cabinet Morel", status: .active, budget: ProjectBudget(amount: 24000), billing: ProjectBilling(amountInvoiced: 7200, billingStatus: .partial), endDate: DemoClock.date(15, month: 12), progress: 30),
            Project(id: "project-lumen", projectNumber: "P-2026-009", name: "Plateforme e-learning", client: "Lumen Formation", status: .active, budget: ProjectBudget(amount: 32000), billing: ProjectBilling(amountInvoiced: 25600, billingStatus: .partial), endDate: DemoClock.date(30), progress: 96)
        ]
    }

    public func project(id: String) async throws -> ProjectDetail {
        guard let project = try await projects().first(where: { $0.id == id }) else { throw MockError.notFound }
        let current: Int
        let update: String
        let day: Int
        var requests: [ChangeRequest] = []
        var tickets: [ProjectTicket] = []
        switch id {
        case "project-pilote":
            current = 3; day = 20; update = "Maquettes validées, début du développement"
            requests = [ChangeRequest(id: "request-pilote", project: id, title: "Ajout de la réservation de groupes", status: .toEstimate)]
        case "project-riviere":
            current = 4; day = 21; update = "Version de recette en ligne"
            tickets = [ProjectTicket(id: "ticket-apple-pay", project: id, title: "Paiement Apple Pay refusé", status: .open)]
        case "project-morel":
            current = 2; day = 16; update = "Arborescence validée"
            requests = (1...2).map { ChangeRequest(id: "request-morel-\($0)", project: id, title: "Demande de modification \($0)", status: .submitted) }
        default:
            current = 5; day = 22; update = "Migration des contenus terminée"
        }
        let phases = ["Cadrage", "Conception", "Développement", "Recette", "Mise en ligne"].enumerated().map { index, title in
            let order = index + 1
            let status: PhaseStatus
            if order < current { status = .completed }
            else if order == current { status = .active }
            else { status = .upcoming }
            return ProjectPhase(id: "\(id)-phase-\(order)", project: id, title: title, order: order, status: status, dueAt: nil)
        }
        var updates = [ProjectUpdate(id: "\(id)-update", project: id, title: update,
            description: id == "project-riviere" ? "The review version is now available. Please share your feedback." : "",
            author: Self.raphael.name, createdAt: DemoClock.date(day))]
        if id == "project-pilote" {
            updates.append(ProjectUpdate(id: "pilote-signed", project: id, title: "Devis DV-2026-038 signé, projet ouvert", author: "automatique", createdAt: DemoClock.date(9)))
        }
        return ProjectDetail(project: project, phases: phases, requests: requests, tickets: tickets, updates: updates)
    }

    public enum MockError: Error { case notFound }
}
