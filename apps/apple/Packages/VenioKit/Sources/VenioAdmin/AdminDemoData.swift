import Foundation
import VenioCore

struct AdminDemoData {
    var overview: BusinessOverview
    var details: [AdminProjectDetail]
    var finance: [String: ProjectFinance]
    var requests: [ChangeRequest]
    var conversations: [Conversation]
    var messages: [String: [Message]]
    var tickets: [Ticket]
    var ticketAuthors: [String: String]
    var issues: [DevIssue]

    init(clock: DemoClock) {
        let clients = ["Agence Pilote", "Boulangerie Rivière", "Cabinet Morel", "Lumen Formation"]
        let ids = ["project-pilote", "project-riviere", "project-morel", "project-lumen"]
        let names = ["Plateforme de réservation", "Site + click & collect", "Espace client", "Plateforme e-learning"]
        let numbers = ["P-2026-018", "P-2026-015", "P-2026-011", "P-2026-009"]
        let budgets = [1840000, 890000, 2400000, 3200000]
        let invoiced = [920000, 445000, 720000, 2560000]
        let invoicedHt = [766667, 370833, 600000, 2133333]
        let received = [700000, 350000, 300000, 2030000]
        let receivedHt = [583333, 291667, 250000, 1691667]
        let costs = [100000, 80000, 120000, 200000]
        let current = [3, 4, 2, 5]
        let progress = [62, 85, 30, 96]
        let ends = [DemoClock.date(28, month: 11), DemoClock.date(6, month: 11), DemoClock.date(15, month: 12), DemoClock.date(30)]
        let updates = ["Maquettes validées, début du développement", "Version de recette en ligne", "Arborescence validée", "Migration des contenus terminée"]
        let updateDays = [20, 21, 16, 22]
        let titles = ["Cadrage", "Conception", "Développement", "Recette", "Mise en ligne"]
        var details: [AdminProjectDetail] = []
        var finance: [String: ProjectFinance] = [:]
        for index in ids.indices {
            let id = ids[index]
            let phases = titles.enumerated().map { offset, title in
                let rank = offset + 1
                let status: AdminPhaseStatus
                if rank < current[index] { status = .completed }
                else if rank == current[index] { status = .inProgress }
                else { status = .upcoming }
                return AdminPhase(id: "\(id)-phase-\(rank)", title: title, order: rank, status: status,
                                  requiresClientValidation: rank == 4, dueAt: ends[index])
            }
            let project = AdminProject(id: id, projectNumber: numbers[index], name: names[index], clientName: clients[index],
                status: .active, endDate: ends[index], progress: progress[index], budgetCents: budgets[index],
                invoicedCents: invoiced[index], currentPhase: CurrentPhase(title: titles[current[index] - 1], rank: current[index], total: 5),
                openChangeRequests: [1, 0, 2, 0][index])
            details.append(AdminProjectDetail(project: project, phases: phases,
                updates: [ClientUpdate(id: id + "-update", title: updates[index], body: "", createdAt: DemoClock.date(updateDays[index]))],
                items: [ProjectItem(id: id + "-mockup", title: "Maquettes", type: .mockup, section: "Conception", status: .validated, isVisible: true, isDownloadable: true),
                        ProjectItem(id: id + "-note", title: "Note de cadrage", type: .note, section: nil, status: .inProgress, isVisible: false, isDownloadable: false)],
                documents: [ProjectDocument(id: id + "-document", type: .quote, originalName: numbers[index] + ".pdf", uploadedAt: DemoClock.date(9))]))
            let margin = receivedHt[index] - costs[index]
            let due = margin / 2
            let paid = due / 2
            finance[id] = ProjectFinance(invoicedHtCents: invoicedHt[index], receivedTtcCents: received[index],
                remainingTtcCents: invoiced[index] - received[index], directCostsCents: costs[index], marginCents: margin,
                beneficiaries: [BeneficiaryBalance(displayName: "Raphaël B.", dueCents: due, paidCents: paid, remainingCents: due - paid),
                                BeneficiaryBalance(displayName: "Société", dueCents: margin - due, paidCents: 0, remainingCents: margin - due)],
                overdueCount: [0, 0, 1, 1][index])
        }
        self.details = details
        self.finance = finance
        let beneficiaries = ["Raphaël B.", "Société"].map { name in
            let balances = ids.compactMap { finance[$0]?.beneficiaries.first { $0.displayName == name } }
            return BeneficiaryBalance(displayName: name, dueCents: balances.reduce(0) { $0 + $1.dueCents },
                paidCents: balances.reduce(0) { $0 + $1.paidCents }, remainingCents: balances.reduce(0) { $0 + $1.remainingCents })
        }
        overview = BusinessOverview(month: DemoClock.date(1), invoicedCents: 4125000, receivedCents: 3380000, availableCashCents: 8642000,
            overdueInvoices: [
                OverdueInvoice(id: "invoice-112", number: "FA-2026-112", clientName: clients[3], projectName: names[3], remainingCents: 240000, dueAt: DemoClock.date(11), lastReminderAt: nil),
                OverdueInvoice(id: "invoice-108", number: "FA-2026-108", clientName: clients[2], projectName: names[2], remainingCents: 365000, dueAt: DemoClock.date(26, month: 9), lastReminderAt: nil),
                OverdueInvoice(id: "invoice-101", number: "FA-2026-101", clientName: "Garage Mercier", projectName: nil, remainingCents: 140000, dueAt: DemoClock.date(12, month: 9), lastReminderAt: nil)
            ], cashIn: [28400, 35100, 22900, 30600, 44300, 33800].enumerated().map {
                MonthlyAmount(month: DemoClock.date(1, month: $0.offset + 5), amountCents: $0.element * 100)
            }, finance: FinanceTotals(marginCents: finance.values.reduce(0) { $0 + $1.marginCents },
                remainingTtcCents: finance.values.reduce(0) { $0 + $1.remainingTtcCents }, beneficiaries: beneficiaries))
        requests = [
            ChangeRequest(id: "request-pilote", title: "Réservation de groupes", description: "Permettre les réservations de groupes.", clientName: clients[0], projectId: ids[0], projectName: names[0], priority: .high, status: .toQuote, createdAt: DemoClock.date(22)),
            ChangeRequest(id: "request-morel-1", title: "Signature électronique des documents", description: "Signer depuis l’espace client.", clientName: clients[2], projectId: ids[2], projectName: names[2], priority: .normal, status: .submitted, createdAt: DemoClock.date(21)),
            ChangeRequest(id: "request-morel-2", title: "Export PDF des factures", description: "Télécharger les factures en PDF.", clientName: clients[2], projectId: ids[2], projectName: names[2], priority: .normal, status: .submitted, createdAt: DemoClock.date(22))
        ]
        conversations = [
            Conversation(id: "general", kind: .channel, title: "Général", unreadCount: 2, lastMessagePreview: "Point d’équipe à 10 h.", lastMessageAt: clock.now),
            Conversation(id: "lea", kind: .dm, title: "Léa Martin", unreadCount: 1, lastMessagePreview: "Les maquettes sont validées.", lastMessageAt: DemoClock.date(23, hour: 9)),
            Conversation(id: "delivery", kind: .group, title: "Livraisons", unreadCount: 1, lastMessagePreview: "La recette est prête.", lastMessageAt: DemoClock.date(22))
        ]
        messages = Dictionary(uniqueKeysWithValues: conversations.map { conversation in
            let messages = (0..<max(1, conversation.unreadCount)).map { index in
                Message(id: "\(conversation.id)-message-\(index)", senderName: "Léa Martin", senderId: "user-lea",
                    content: conversation.lastMessagePreview ?? "",
                    createdAt: (conversation.lastMessageAt ?? clock.now).addingTimeInterval(TimeInterval(index - conversation.unreadCount + 1) * 60), isDeleted: false)
            }
            return (conversation.id, messages)
        })
        tickets = (0..<5).map { index in
            Ticket(id: index == 0 ? "ticket-apple-pay" : "ticket-\(index)",
                title: ["Paiement Apple Pay refusé", "Accès à la recette", "Question sur une facture", "Notification manquante", "Erreur de téléchargement"][index],
                message: "Pouvez-vous vérifier ce point ?", category: .problem, priority: index == 0 ? .high : .normal,
                status: index.isMultiple(of: 2) ? .open : .inProgress, authorName: index == 0 ? "Hugo Bernard" : "Léa Martin",
                projectName: index == 0 ? names[1] : nil, createdAt: DemoClock.date(21 + index % 3), replies: [])
        }
        ticketAuthors = Dictionary(uniqueKeysWithValues: tickets.enumerated().map {
            ($0.element.id, $0.offset == 0 ? "user-hugo" : "user-lea")
        })
        issues = (1...15).map { index in
            DevIssue(id: "issue-\(index)", identifier: "VEN-\(100 + index)", title: "Amélioration \(index)",
                status: index <= 12 ? .inProgress : [.todo, .inReview, .done][index - 13], priority: .medium,
                projectName: "Venio", assigneeName: "Raphaël B.")
        }
    }
}
