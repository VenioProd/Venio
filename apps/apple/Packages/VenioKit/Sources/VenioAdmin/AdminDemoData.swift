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
        let updateBodies = [
            "Les maquettes du parcours de réservation sont validées. Nous intégrons les disponibilités et les premiers écrans mobiles.",
            "Le click & collect est disponible en recette. Vous pouvez vérifier le panier, les créneaux de retrait et les confirmations.",
            "La structure de l’espace client est approuvée. Nous préparons les écrans de consultation et de signature des documents.",
            "Les cours et les ressources ont été migrés. Nous vérifions les accès des apprenants avant la mise en ligne."
        ]
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
                                  requiresClientValidation: rank == 4,
                                  dueAt: Calendar(identifier: .gregorian).date(byAdding: .day, value: (rank - 5) * 14, to: ends[index]))
            }
            let project = AdminProject(id: id, projectNumber: numbers[index], name: names[index], clientName: clients[index],
                status: .active, endDate: ends[index], progress: progress[index], budgetCents: budgets[index],
                invoicedCents: invoiced[index], currentPhase: CurrentPhase(title: titles[current[index] - 1], rank: current[index], total: 5),
                openChangeRequests: [1, 0, 2, 0][index])
            details.append(AdminProjectDetail(project: project, phases: phases,
                updates: [ClientUpdate(id: id + "-update", title: updates[index], body: updateBodies[index], createdAt: DemoClock.date(updateDays[index]))],
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
        let authors = [("Léa Martin", "user-lea"), ("Hugo Bernard", "user-hugo"), ("Raphaël B.", "user-raphael")]
        let threads = [
            ["La recette de Rivière avance bien, je termine le panier.", "Je vérifie les paiements sur mobile cet après-midi.", "Merci, gardons un point sur les retours client.", "Le client a confirmé sa disponibilité.", "Point d’équipe à 10 h."],
            ["J’ai envoyé les derniers écrans au client.", "Le parcours mobile est plus clair, merci.", "Je prépare la mise à jour de suivi.", "Les maquettes sont validées."],
            ["La migration des cours est terminée.", "Les accès apprenants sont vérifiés.", "Je vérifie encore les documents joints.", "Les contrôles sont passés, nous pouvons inviter le client.", "La recette est prête."]
        ]
        messages = Dictionary(uniqueKeysWithValues: conversations.enumerated().map { offset, conversation in
            let contents = threads[offset]
            let messages = contents.enumerated().map { index, content in
                let author = authors[(offset + index) % authors.count]
                return Message(id: "\(conversation.id)-message-\(index)", senderName: author.0, senderId: author.1,
                    content: content,
                    createdAt: (conversation.lastMessageAt ?? clock.now).addingTimeInterval(TimeInterval(index - contents.count + 1) * 180),
                    isDeleted: offset == 0 && index == 1)
            }
            return (conversation.id, messages)
        })
        let ticketMessages = [
            "Apple Pay refuse le paiement sur Safari alors que le paiement par carte fonctionne. Pouvez-vous vérifier avant la recette ?",
            "Mon lien de recette affiche un accès refusé depuis ce matin. Faut-il renouveler mon invitation ?",
            "La facture d’acompte indique une échéance différente du devis. Quelle date devons-nous retenir ?",
            "La mise à jour apparaît dans mon espace, mais je n’ai pas reçu l’e-mail de notification.",
            "Le téléchargement du cahier des charges s’interrompt sur iPad. Le fichier est-il toujours disponible ?"
        ]
        tickets = (0..<5).map { index in
            Ticket(id: index == 0 ? "ticket-apple-pay" : "ticket-\(index)",
                title: ["Paiement Apple Pay refusé", "Accès à la recette", "Question sur une facture", "Notification manquante", "Erreur de téléchargement"][index],
                message: ticketMessages[index], category: .problem, priority: index == 0 ? .high : .normal,
                status: index.isMultiple(of: 2) ? .open : .inProgress, authorName: index == 0 ? "Hugo Bernard" : "Léa Martin",
                projectName: index == 0 ? names[1] : nil, createdAt: DemoClock.date(21 + index % 3), replies: index < 2 ? [
                    TicketReply(authorId: "user-raphael", authorName: "Raphaël B.",
                        message: index == 0 ? "Nous reproduisons le refus sur Safari. Le contrôle du domaine Apple Pay est en cours." : "L’invitation a été renouvelée. Pouvez-vous réessayer avec le nouveau lien ?", createdAt: DemoClock.date(22)),
                    TicketReply(authorId: "user-hugo", authorName: "Hugo Bernard",
                        message: index == 0 ? "Le paiement carte reste disponible pendant la vérification." : "Le lien fonctionne à nouveau, merci.", createdAt: DemoClock.date(23))
                ] : [])
        }
        ticketAuthors = Dictionary(uniqueKeysWithValues: tickets.enumerated().map {
            ($0.element.id, $0.offset == 0 ? "user-hugo" : "user-lea")
        })
        let issueTitles = [
            "Corriger le retour Apple Pay sur Safari", "Synchroniser les créneaux de réservation", "Adapter le panier aux petits écrans",
            "Ajouter la signature des documents client", "Fiabiliser l’export PDF des factures", "Améliorer la recherche des cours",
            "Optimiser les images du catalogue", "Rendre le menu accessible au clavier", "Corriger les notifications de recette",
            "Préserver les filtres de la liste clients", "Reprendre les liens après migration", "Afficher les erreurs du formulaire de contact",
            "Préparer les redirections de mise en ligne", "Vérifier les droits des apprenants", "Corriger le contraste des boutons"
        ]
        issues = (1...15).map { index in
            DevIssue(id: "issue-\(index)", identifier: "VEN-\(100 + index)", title: issueTitles[index - 1],
                status: index <= 12 ? .inProgress : [.todo, .inReview, .done][index - 13], priority: .medium,
                projectName: ["Venio", "Agence Pilote", "Boulangerie Rivière", "Lumen Formation"][(index - 1) % 4],
                assigneeName: ["Raphaël B.", "Léa Martin", "Hugo Bernard"][(index - 1) % 3])
        }
    }
}
