import Foundation

public enum AdminProjectStatus: String, Codable, Sendable, CaseIterable {
    case active = "EN_COURS"
    case waiting = "EN_ATTENTE"
    case completed = "TERMINE"
    case unknown

    public init(from decoder: any Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

public enum AdminPhaseStatus: String, Codable, Sendable, CaseIterable {
    case upcoming = "A_VENIR"
    case inProgress = "EN_COURS"
    case awaitingValidation = "EN_ATTENTE_VALIDATION"
    case completed = "TERMINEE"
    case unknown

    public init(from decoder: any Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

public enum AdminChangeRequestStatus: String, Codable, Sendable, CaseIterable {
    case submitted = "SOUMISE"
    case toQuote = "A_CHIFFRER"
    case planned = "PLANIFIEE"
    case inProgress = "EN_COURS"
    case delivered = "LIVREE"
    case validated = "VALIDEE"
    case refused = "REFUSEE"
    case unknown

    public init(from decoder: any Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

public enum AdminTicketStatus: String, Codable, Sendable, CaseIterable {
    case open = "OUVERT"
    case inProgress = "EN_COURS"
    case resolved = "RESOLU"
    case closed = "FERME"
    case unknown

    public init(from decoder: any Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

public enum AdminPriority: String, Codable, Sendable, CaseIterable {
    case low = "BASSE"
    case normal = "NORMALE"
    case high = "HAUTE"
    case urgent = "URGENTE"
    case unknown

    public init(from decoder: any Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

public enum ConversationKind: String, Codable, Sendable, CaseIterable {
    case channel = "CHANNEL"
    case dm = "DM"
    case group = "GROUP"
    case unknown

    public init(from decoder: any Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

public enum ProjectItemStatus: String, Codable, Sendable, CaseIterable {
    case waiting = "EN_ATTENTE"
    case inProgress = "EN_COURS"
    case completed = "TERMINE"
    case validated = "VALIDE"
    case unknown

    public init(from decoder: any Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

public enum ProjectItemType: String, Codable, Sendable, CaseIterable {
    case deliverable = "LIVRABLE"
    case quote = "DEVIS"
    case invoice = "FACTURE"
    case contract = "CONTRAT"
    case specification = "CAHIER_DES_CHARGES"
    case mockup = "MAQUETTE"
    case documentation = "DOCUMENTATION"
    case link = "LIEN"
    case note = "NOTE"
    case other = "AUTRE"
    case unknown

    public init(from decoder: any Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

public enum ProjectDocumentType: String, Codable, Sendable, CaseIterable {
    case quote = "DEVIS"
    case invoice = "FACTURE"
    case projectFile = "FICHIER_PROJET"
    case unknown

    public init(from decoder: any Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

public enum TicketCategory: String, Codable, Sendable, CaseIterable {
    case question = "QUESTION"
    case request = "DEMANDE"
    case problem = "PROBLEME"
    case unknown

    public init(from decoder: any Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

public enum DevIssueStatus: String, Codable, Sendable, CaseIterable {
    case backlog = "BACKLOG"
    case todo = "TODO"
    case inProgress = "IN_PROGRESS"
    case inReview = "IN_REVIEW"
    case blocked = "BLOCKED"
    case done = "DONE"
    case duplicate = "DUPLICATE"
    case cancelled = "CANCELLED"
    case unknown

    public init(from decoder: any Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

public enum DevPriority: String, Codable, Sendable, CaseIterable {
    case none = "NO_PRIORITY"
    case low = "LOW"
    case medium = "MEDIUM"
    case high = "HIGH"
    case urgent = "URGENT"
    case unknown

    public init(from decoder: any Decoder) throws {
        self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

public enum PhaseAction: String, Sendable {
    case start, complete, revert
    case requestValidation = "request-validation"
    case cancelValidationRequest = "cancel-validation-request"
}

public enum TriageAction: Sendable {
    case include, quote(projectId: String), refuse(reason: String), start, deliver
}
