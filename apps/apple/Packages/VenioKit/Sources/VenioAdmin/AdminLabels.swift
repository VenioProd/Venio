import Foundation

extension AdminSection {
    var title: String {
        switch self {
        case .business: "Vue business"
        case .projects: "Projets"
        case .messaging: "Messagerie"
        case .activity: "Centre d’activité"
        case .tickets: "Tickets"
        case .dev: "Dev workspace"
        }
    }
    var icon: String {
        switch self {
        case .business: "chart.xyaxis.line"
        case .projects: "folder"
        case .messaging: "bubble.left.and.bubble.right"
        case .activity: "waveform.path.ecg"
        case .tickets: "ticket"
        case .dev: "chevron.left.forwardslash.chevron.right"
        }
    }
    var hasDetail: Bool { [.projects, .messaging, .tickets, .dev].contains(self) }
}

extension AdminPhase {
    var allowedActions: [PhaseAction] {
        switch status {
        case .upcoming: [.start]
        case .inProgress: [requiresClientValidation ? .requestValidation : .complete, .revert]
        case .awaitingValidation: [.cancelValidationRequest]
        case .completed: requiresClientValidation ? [] : [.revert]
        case .unknown: []
        }
    }
}
extension PhaseAction {
    var title: String {
        switch self {
        case .start: "Démarrer"
        case .complete: "Terminer"
        case .revert: "Revenir en arrière"
        case .requestValidation: "Demander la validation"
        case .cancelValidationRequest: "Annuler la demande"
        }
    }
}
extension AdminPhaseStatus {
    var title: String {
        switch self {
        case .upcoming: "À venir"
        case .inProgress: "En cours"
        case .awaitingValidation: "En attente de validation"
        case .completed: "Terminée"
        case .unknown: "Inconnu"
        }
    }
}
extension AdminChangeRequestStatus {
    var title: String {
        switch self {
        case .submitted: "Soumise"
        case .toQuote: "À chiffrer"
        case .planned: "Planifiée"
        case .inProgress: "En cours"
        case .delivered: "Livrée"
        case .validated: "Validée"
        case .refused: "Refusée"
        case .unknown: "Inconnu"
        }
    }
}
extension AdminTicketStatus {
    var title: String {
        switch self {
        case .open: "Ouvert"
        case .inProgress: "En cours"
        case .resolved: "Résolu"
        case .closed: "Fermé"
        case .unknown: "Inconnu"
        }
    }
}
extension DevIssueStatus {
    var title: String {
        switch self {
        case .backlog: "Backlog"
        case .todo: "À faire"
        case .inProgress: "En cours"
        case .inReview: "En revue"
        case .blocked: "Bloqué"
        case .done: "Terminé"
        case .duplicate: "Doublon"
        case .cancelled: "Annulé"
        case .unknown: "Inconnu"
        }
    }
}
extension AdminPriority {
    var title: String {
        switch self {
        case .low: "Basse"
        case .normal: "Normale"
        case .high: "Haute"
        case .urgent: "Urgente"
        case .unknown: "Inconnu"
        }
    }
}
extension DevPriority {
    var title: String {
        switch self {
        case .none: "Sans priorité"
        case .low: "Basse"
        case .medium: "Normale"
        case .high: "Haute"
        case .urgent: "Urgente"
        case .unknown: "Inconnu"
        }
    }
}
extension ProjectDocumentType {
    var title: String {
        switch self {
        case .quote: "Devis"
        case .invoice: "Facture"
        case .projectFile: "Fichier projet"
        case .unknown: "Inconnu"
        }
    }
}
extension ProjectItemType {
    var title: String {
        switch self {
        case .deliverable: "Livrable"
        case .quote: "Devis"
        case .invoice: "Facture"
        case .contract: "Contrat"
        case .specification: "Cahier des charges"
        case .mockup: "Maquette"
        case .documentation: "Documentation"
        case .link: "Lien"
        case .note: "Note"
        case .other: "Autre"
        case .unknown: "Inconnu"
        }
    }
}
