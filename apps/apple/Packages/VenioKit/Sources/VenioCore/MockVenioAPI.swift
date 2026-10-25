import Foundation

public actor MockVenioAPI: VenioAPI {
    public static let lea = UserSummary(id: "user-lea", name: "Léa Martin", initials: "LM", role: .commercial, permissions: ["view_crm", "manage_crm", "manage_quotes", "view_projects", "view_phases"])
    public static let hugo = UserSummary(id: "user-hugo", name: "Hugo Bernard", initials: "HB", role: .commercial, permissions: ["view_crm", "manage_crm", "manage_quotes", "view_projects", "view_phases"])
    public static let raphael = UserSummary(id: "user-raphael", name: "Raphaël B.", initials: "RB", role: .admin, permissions: ["view_crm", "manage_crm", "manage_billing", "view_projects", "view_phases"])
    public nonisolated let clock: DemoClock
    private let user: UserSummary
    public private(set) var pushRegistration: PushRegistration?
    private var storedLeads: [Lead]?
    private var storedQuotes: [QuoteProposal]?
    private var interactions: [UUID: (InteractionDraft, TimelineEntry)] = [:]

    public nonisolated func monthlyTarget() -> Decimal? { 40000 }

    public init(clock: DemoClock = DemoClock(), user: UserSummary = MockVenioAPI.lea) {
        self.clock = clock
        self.user = user
    }

    public func createLead(_ draft: LeadDraft) throws -> Lead {
        guard user.permissions.contains("manage_crm") else { throw VenioAPIError(code: "FORBIDDEN") }
        guard !draft.company.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw VenioAPIError(code: "INVALID_INPUT") }
        let lead = Lead(id: UUID().uuidString, company: draft.company, contactName: draft.contactName,
            contactEmail: draft.contactEmail, contactPhone: draft.contactPhone, source: draft.source, status: .lead,
            budget: draft.budget, nextActionAt: nil, serviceType: draft.serviceType, leadTemperature: .warm,
            assignedTo: draft.assignedTo ?? user.id, score: nil, notes: draft.notes, createdAt: .now, canQuote: !user.permissions.isDisjoint(with: ["manage_quotes", "manage_billing"]))
        var records = try leads()
        records.insert(lead, at: 0)
        storedLeads = records
        return lead
    }

    public func registerPushToken(_ token: String, environment: PushEnvironment, language: String?) throws {
        guard (64...200).contains(token.count), token.allSatisfy(\.isHexDigit),
              language == nil || ["fr", "en"].contains(language!) else { throw VenioAPIError(code: "INVALID_APNS") }
        pushRegistration = PushRegistration(token: token, environment: environment, language: language)
    }
    public func unregisterPushToken() { pushRegistration = nil }

    public func currentUser() throws -> UserSummary { user }

    public func leads() throws -> [Lead] {
        if let storedLeads { return storedLeads }
        let lea = Self.lea.id
        let hugo = Self.hugo.id
        let open = [
            Lead(id: "lead-calder", company: "Maison Calder", contactName: "Claire Calder", contactEmail: "claire@maison-calder.example", contactPhone: "+33 6 00 00 00 01", source: "Scan de carte de visite — Vivatech Paris", status: .proposal, budget: 14800, nextActionAt: DemoClock.date(23, hour: 10, minute: 30), serviceType: "Site vitrine + SEO", leadTemperature: .veryHot, assignedTo: lea, score: 86, notes: "La cliente souhaite revoir la proposition la semaine prochaine.", createdAt: DemoClock.date(13, hour: 17, minute: 48)),
            Lead(id: "lead-nova", company: "Atelier Nova", contactName: "Malik Benali", status: .demo, budget: 22500, nextActionAt: DemoClock.date(23, hour: 14), serviceType: "E-commerce", leadTemperature: .hot, assignedTo: lea, score: 74, createdAt: DemoClock.date(10)),
            Lead(id: "lead-ferrand", company: "Cabinet Ferrand Avocats", contactName: "Sophie Ferrand", contactEmail: "sophie@ferrand.example", contactPhone: "+33 6 00 00 00 02", status: .contacted, budget: 9600, nextActionAt: DemoClock.date(21), serviceType: "Site + espace client", leadTemperature: .warm, assignedTo: lea, score: 58, createdAt: DemoClock.date(10)),
            Lead(id: "lead-halles", company: "Brasserie Les Halles", contactName: "Julien Roux", status: .qualified, budget: 6400, nextActionAt: nil, serviceType: "Site + réservation", leadTemperature: .hot, assignedTo: lea, score: 69, createdAt: DemoClock.date(10)),
            Lead(id: "lead-okami", company: "Studio Okami", contactName: "Yuki Tanaka", source: "Formulaire du site", status: .lead, budget: 38000, nextActionAt: nil, serviceType: "App mobile", leadTemperature: .warm, assignedTo: nil, score: 41, notes: "We would like to discuss the mobile app requirements next week.", createdAt: DemoClock.date(23, hour: 8, minute: 52)),
            Lead(id: "lead-aubin", company: "Clinique Saint-Aubin", contactName: "Dr Paul Aubin", status: .proposal, budget: 31000, nextActionAt: DemoClock.date(26), serviceType: "Plateforme de RDV", leadTemperature: .hot, assignedTo: hugo, score: 80, createdAt: DemoClock.date(10)),
            Lead(id: "lead-verlaine", company: "Domaine Verlaine", contactName: "Anne Verlaine", status: .contacted, budget: 12000, nextActionAt: DemoClock.date(27), serviceType: "E-commerce vins", leadTemperature: .cold, assignedTo: hugo, score: 35, createdAt: DemoClock.date(10)),
            Lead(id: "lead-arcadie", company: "Fondation Arcadie", contactName: "Marc Delorme", contactEmail: "marc@arcadie.example", contactPhone: "+33 6 00 00 00 03", status: .demo, budget: 18200, nextActionAt: DemoClock.date(23, hour: 16), serviceType: "Refonte de site", leadTemperature: .warm, assignedTo: lea, score: 62, createdAt: DemoClock.date(10))
        ]
        let reasons = Array(repeating: "budget", count: 21) + Array(repeating: "concurrent", count: 14)
            + Array(repeating: "timing", count: 9) + Array(repeating: "sans réponse", count: 6)
        let closed = (0..<66).map { index in
            let date = DemoClock.date(10 + index % 10, month: 5 + index % 6)
            return Lead(id: "closed-\(index)", company: "Client clos \(index + 1)", contactName: "", status: index < 16 ? .won : .lost,
                budget: nil, nextActionAt: nil, serviceType: "", leadTemperature: .cold, assignedTo: lea, score: nil,
                createdAt: clock.calendar.date(byAdding: .day, value: -34, to: date)!, updatedAt: date, statusChangedAt: date,
                lostReason: index < 16 ? "" : reasons[index - 16])
        }
        let result = (open + closed).map { value in
            var lead = value
            lead.canQuote = !user.permissions.isDisjoint(with: ["manage_quotes", "manage_billing"]) && (user.permissions.contains("manage_billing") || lead.assignedTo == user.id)
            return lead
        }
        storedLeads = result
        return result
    }

    public func lead(id: String) throws -> Lead {
        guard let result = try leads().first(where: { $0.id == id }) else { throw VenioAPIError(code: "NOT_FOUND") }
        return result
    }

    public func timeline(leadId: String) throws -> [TimelineEntry] {
        let created = interactions.values.filter { $0.0.subjectType == .lead && $0.0.subjectId == leadId }.map { $0.1 }
        return try (seedTimeline(leadId: leadId) + created).sorted { $0.date > $1.date }
    }

    private func seedTimeline(leadId: String) throws -> [TimelineEntry] {
        _ = try lead(id: leadId)
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

    public func quotes() throws -> [QuoteProposal] {
        if let storedQuotes { return storedQuotes }
        let current = [
            quote("041", client: "Maison Calder", project: "project-calder", template: "Site vitrine", amount: 14800, status: .sent, firstViewedAt: DemoClock.date(22, hour: 18, minute: 12)),
            quote("039", client: "Clinique Saint-Aubin", project: "project-aubin", template: "Plateforme sur mesure", amount: 31000, status: .sent, author: Self.hugo.id),
            quote("038", client: "Agence Pilote", project: "project-pilote", template: "Plateforme sur mesure", amount: 18400, status: .signed, signedAt: DemoClock.date(9)),
            quote("036", client: "Boulangerie Rivière", project: "project-riviere", template: "E-commerce", amount: 8900, status: .signed, signedAt: DemoClock.date(2)),
            quote("033", client: "Garage Mercier", project: "project-mercier", template: "Site vitrine", amount: 5200, status: .expired)
        ]
        let amounts: [Decimal] = [18200, 24600, 9800, 15400, 31200]
        let history = amounts.enumerated().map { index, amount in
            quote(["010", "015", "018", "022", "030"][index], client: ["Studio Héron", "Pâtisserie Marlot", "Cabinet Valère", "Éditions Corail", "Hôtel des Arts"][index], project: "project-history-\(index)", template: ["Refonte du site", "Boutique en ligne", "Portail de prise de rendez-vous", "Catalogue des éditions", "Réservation de séjours"][index],
                  amount: amount, status: .signed, signedAt: DemoClock.date(12, month: 5 + index))
        }
        let result = current + history
        storedQuotes = result
        return result
    }

    private func quote(_ number: String, client: String, project: String, template: String, amount: Decimal, status: QuoteStatus, firstViewedAt: Date? = nil, signedAt: Date? = nil, author: String = MockVenioAPI.lea.id) -> QuoteProposal {
        QuoteProposal(id: "quote-\(number)", project: project, client: client, createdBy: author, title: template, status: status, lines: [QuoteLine(description: template, quantity: 1, unitPrice: amount, taxRate: 20)], signature: QuoteSignature(signedAt: signedAt), firstViewedAt: firstViewedAt, expiresAt: clock.calendar.date(byAdding: .day, value: 30, to: signedAt ?? DemoClock.date(1)), createdAt: signedAt ?? DemoClock.date(1), updatedAt: signedAt ?? DemoClock.date(1), reference: "DV-2026-\(number)", leadId: number == "041" ? "lead-calder" : nil)
    }

    public func lostReasons() -> [String] { ["Prix", "Délai", "Concurrent", "Pas de budget", "Abandon du projet"] }

    public func quoteTemplates() throws -> [QuoteTemplate] {
        [
            QuoteTemplate(id: "template-site", name: "Site vitrine", title: "Site vitrine", lines: [
                QuoteLine(description: "Conception graphique & maquettes", quantity: 1, unitPrice: 1800, taxRate: 20),
                QuoteLine(description: "Développement du site vitrine", quantity: 1, unitPrice: 3200, taxRate: 20),
                QuoteLine(description: "Module de réservation en ligne", quantity: 1, unitPrice: 1000, taxRate: 20),
                QuoteLine(description: "Mise en ligne & formation", quantity: 1, unitPrice: 400, taxRate: 20)
            ]),
            QuoteTemplate(id: "template-commerce", name: "E-commerce", title: "E-commerce", lines: [
                QuoteLine(description: "Conception de la boutique", quantity: 1, unitPrice: 2400, taxRate: 20),
                QuoteLine(description: "Catalogue et paiement", quantity: 1, unitPrice: 5700, taxRate: 20),
                QuoteLine(description: "Mise en ligne & formation", quantity: 1, unitPrice: 800, taxRate: 20)
            ]),
            QuoteTemplate(id: "template-platform", name: "Plateforme sur mesure", title: "Plateforme sur mesure", lines: [
                QuoteLine(description: "Cadrage et conception", quantity: 1, unitPrice: 4000, taxRate: 20),
                QuoteLine(description: "Développement sur mesure", quantity: 1, unitPrice: 13000, taxRate: 20),
                QuoteLine(description: "Recette et déploiement", quantity: 1, unitPrice: 1400, taxRate: 20)
            ]),
            QuoteTemplate(id: "template-seo", name: "Pack SEO", title: "Pack SEO", lines: [
                QuoteLine(description: "Audit et optimisation SEO", quantity: 1, unitPrice: 1200, taxRate: 20),
                QuoteLine(description: "Accompagnement mensuel", quantity: 3, unitPrice: 400, taxRate: 20)
            ])
        ]
    }

    private func requireQuotesPermission() throws {
        guard !user.permissions.isDisjoint(with: ["manage_quotes", "manage_billing"]) else {
            throw VenioAPIError(code: "FORBIDDEN")
        }
    }

    public func createQuote(templateId: String, projectId: String? = nil, leadId: String? = nil, title: String?) throws -> QuoteProposal {
        try requireQuotesPermission()
        guard (projectId != nil) != (leadId != nil) else { throw VenioAPIError(code: "INVALID_INPUT") }
        let project = try projects().first { $0.id == projectId }
        if projectId != nil && project?.canQuote != true { throw VenioAPIError(code: "PROJECT_OUT_OF_SCOPE") }
        if let leadId, try !lead(id: leadId).canQuote { throw VenioAPIError(code: "LEAD_OUT_OF_SCOPE") }
        guard let template = try quoteTemplates().first(where: { $0.id == templateId }) else {
            throw VenioAPIError(code: "NOT_FOUND")
        }
        let quote = QuoteProposal(id: UUID().uuidString, project: project?.id, client: project?.client, createdBy: user.id,
            title: title ?? template.title, status: .draft, lines: template.lines, signature: QuoteSignature(signedAt: nil),
            firstViewedAt: nil, expiresAt: clock.calendar.date(byAdding: .day, value: template.validityDays, to: clock.now),
            createdAt: clock.now, updatedAt: clock.now, reference: "DV-2026-" + String(100 + (try quotes().count)), leadId: leadId)
        var records = try quotes()
        records.insert(quote, at: 0)
        storedQuotes = records
        return quote
    }

    public func attachQuote(id: String, projectId: String) throws -> QuoteProposal {
        try requireQuotesPermission()
        var records = try quotes()
        guard let index = records.firstIndex(where: { $0.id == id }) else { throw VenioAPIError(code: "NOT_FOUND") }
        guard records[index].createdBy == user.id || user.permissions.contains("manage_billing") else { throw VenioAPIError(code: "NOT_PROPOSAL_OWNER") }
        guard records[index].project == nil else { throw VenioAPIError(code: "PROPOSAL_ALREADY_ATTACHED") }
        guard records[index].status == .draft else { throw VenioAPIError(code: "PROPOSAL_NOT_DRAFT") }
        guard let project = try projects().first(where: { $0.id == projectId }), project.canQuote else { throw VenioAPIError(code: "PROJECT_OUT_OF_SCOPE") }
        records[index].project = project.id
        records[index].client = project.client
        records[index].updatedAt = clock.now
        storedQuotes = records
        return records[index]
    }

    public func sendQuote(id: String) throws -> QuoteProposal {
        try requireQuotesPermission()
        var records = try quotes()
        guard let index = records.firstIndex(where: { $0.id == id }) else { throw VenioAPIError(code: "NOT_FOUND") }
        guard records[index].createdBy == user.id || user.permissions.contains("manage_billing") else {
            throw VenioAPIError(code: "NOT_PROPOSAL_OWNER")
        }
        guard records[index].status != .signed else { throw VenioAPIError(code: "PROPOSAL_ALREADY_SIGNED") }
        guard records[index].status == .draft else { throw VenioAPIError(code: "PROPOSAL_NOT_DRAFT") }
        guard records[index].project != nil else { throw VenioAPIError(code: "PROPOSAL_NOT_ATTACHED") }
        records[index].status = .sent
        records[index].updatedAt = clock.now
        storedQuotes = records
        return records[index]
    }

    public func createInteraction(_ draft: InteractionDraft) throws -> TimelineEntry {
        if let (previous, entry) = interactions[draft.idempotencyKey] {
            var content = draft
            content.audioFileURL = previous.audioFileURL
            guard previous == content else { throw VenioAPIError(code: "IDEMPOTENCY_CONFLICT") }
            return entry
        }
        guard user.permissions.contains("manage_crm") else { throw VenioAPIError(code: "FORBIDDEN") }
        if draft.subjectType == .lead {
            guard try lead(id: draft.subjectId).assignedTo == user.id else { throw VenioAPIError(code: "NOT_FOUND") }
        } else {
            guard try projects().contains(where: { $0.client == draft.subjectId }) else { throw VenioAPIError(code: "NOT_FOUND") }
        }
        guard !draft.body.isEmpty, draft.body.count <= 20000, (draft.subject?.count ?? 0) <= 500,
              draft.lang == nil || ["fr", "en"].contains(draft.lang!) else { throw VenioAPIError(code: "INVALID_INPUT") }
        let entry = TimelineEntry(id: "interaction-" + UUID().uuidString, date: draft.occurredAt, title: draft.subject ?? "", body: draft.body)
        interactions[draft.idempotencyKey] = (draft, entry)
        return entry
    }

    public func updateLead(id: String, patch: LeadPatch) throws -> Lead {
        try patch.validate()
        guard user.permissions.contains("manage_crm") else { throw VenioAPIError(code: "FORBIDDEN") }
        var records = try leads()
        guard let index = records.firstIndex(where: { $0.id == id }), records[index].assignedTo == user.id else {
            throw VenioAPIError(code: "NOT_FOUND")
        }
        if let status = patch.status, records[index].status != status {
            records[index].status = status
            records[index].statusChangedAt = clock.now
        }
        if patch.status == .lost, let reason = patch.lostReason { records[index].lostReason = reason }
        switch patch.nextActionAt {
        case .set(let date): records[index].nextActionAt = date
        case .clear: records[index].nextActionAt = nil
        case nil: break
        }
        records[index].updatedAt = clock.now
        storedLeads = records
        return records[index]
    }

    public func appointments() throws -> [Appointment] {
        [Appointment(id: "appointment-nova", leadId: "lead-nova", title: "Démo d’Atelier Nova", startsAt: DemoClock.date(23, hour: 14), assignedTo: Self.lea.id, location: "Visio", endsAt: DemoClock.date(23, hour: 15), leadCompany: "Atelier Nova")]
    }

    public func projects() throws -> [Project] {
        let history = try quotes().filter { $0.project?.hasPrefix("project-history-") == true }.enumerated().map { index, quote in
            Project(id: quote.project!, projectNumber: "P-2026-" + String(format: "%03d", index + 1),
                    name: quote.title, client: quote.client ?? "", status: .completed,
                    budget: ProjectBudget(amount: quote.amountHT), billing: ProjectBilling(amountInvoiced: quote.amountHT, billingStatus: .invoiced),
                    endDate: quote.signature.signedAt.flatMap { clock.calendar.date(byAdding: .day, value: 30, to: $0) },
                    progress: 100, assignedTo: Self.lea.id, canQuote: user.permissions.contains("manage_billing") || user.id == Self.lea.id)
        }
        return ([
            Project(id: "project-pilote", projectNumber: "P-2026-018", name: "Plateforme de réservation", client: "Agence Pilote", status: .active, budget: ProjectBudget(amount: 18400), billing: ProjectBilling(amountInvoiced: 9200, billingStatus: .partial), endDate: DemoClock.date(28, month: 11), progress: 62, assignedTo: Self.lea.id, canQuote: user.permissions.contains("manage_billing") || user.id == Self.lea.id),
            Project(id: "project-riviere", projectNumber: "P-2026-015", name: "Site + click & collect", client: "Boulangerie Rivière", status: .active, budget: ProjectBudget(amount: 8900), billing: ProjectBilling(amountInvoiced: 4450, billingStatus: .partial), endDate: DemoClock.date(6, month: 11), progress: 85, assignedTo: Self.hugo.id, canQuote: user.permissions.contains("manage_billing") || user.id == Self.lea.id || user.id == Self.hugo.id),
            Project(id: "project-morel", projectNumber: "P-2026-011", name: "Espace client", client: "Cabinet Morel", status: .active, budget: ProjectBudget(amount: 24000), billing: ProjectBilling(amountInvoiced: 7200, billingStatus: .partial), endDate: DemoClock.date(15, month: 12), progress: 30, assignedTo: Self.hugo.id, canQuote: user.permissions.contains("manage_billing") || user.id == Self.hugo.id),
            Project(id: "project-lumen", projectNumber: "P-2026-009", name: "Plateforme e-learning", client: "Lumen Formation", status: .active, budget: ProjectBudget(amount: 32000), billing: ProjectBilling(amountInvoiced: 25600, billingStatus: .partial), endDate: DemoClock.date(30), progress: 96, assignedTo: Self.lea.id, canQuote: user.permissions.contains("manage_billing") || user.id == Self.lea.id)
        ] + history).map { value in
            var project = value
            project.canQuote = project.canQuote && !user.permissions.isDisjoint(with: ["manage_quotes", "manage_billing"])
            return project
        }
    }

    public func project(id: String) throws -> ProjectDetail {
        guard let project = try projects().first(where: { $0.id == id }) else { throw VenioAPIError(code: "NOT_FOUND") }
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
            day = 22
            if project.status == .completed {
                current = 6; update = "Projet livré"
            } else {
                current = 5; update = "Migration des contenus terminée"
            }
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
            author: Self.raphael.name, createdAt: project.status == .completed ? project.endDate ?? DemoClock.date(day) : DemoClock.date(day))]
        if id == "project-pilote" {
            updates.append(ProjectUpdate(id: "pilote-signed", project: id, title: "Devis DV-2026-038 signé, projet ouvert", author: "automatique", createdAt: DemoClock.date(9)))
        }
        return ProjectDetail(project: project, phases: phases, requests: requests, tickets: tickets, updates: updates)
    }

}
