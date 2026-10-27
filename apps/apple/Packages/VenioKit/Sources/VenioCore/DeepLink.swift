import Foundation

public enum DeepLink: Sendable, Equatable, Hashable {
    case lead(String), quote(String), project(String), projectQuotes(String)
    case today, pipeline, figures

    // Serveur : /admin/crm, /admin/crm/leads/:id, /admin/projets/:id[?tab=phases], /admin/demandes-clients/:id, /admin/tickets.
    public static func parse(type: String, link: String?) -> DeepLink? {
        guard let link, let url = URLComponents(string: link) else { return nil }
        if url.scheme == "venio" {
            let parts = url.path.split(separator: "/").map(String.init)
            if parts.isEmpty {
                switch url.host {
                case "today": return .today
                case "pipeline": return .pipeline
                case "figures": return .figures
                default: return nil
                }
            }
            guard parts.count == 1, let id = parts.first, valid(id) else { return nil }
            switch url.host {
            case "lead": return .lead(id)
            case "quote": return .quote(id)
            case "project": return .project(id)
            default: return nil
            }
        }
        guard url.scheme == nil || ["https", "http"].contains(url.scheme!),
              url.host == nil || url.host == "venio.paris" else { return nil }
        let parts = url.path.split(separator: "/").map(String.init)
        guard parts.first == "admin", let id = parts.last, valid(id) else { return nil }
        switch type {
        case "CRM_LEAD_CREATED", "CRM_LEAD_ASSIGNED", "LEAD_FOLLOW_UP_DUE":
            guard parts.count == 4, parts[1] == "crm", parts[2] == "leads" else { return nil }
            return .lead(id)
        case "QUOTE_PROPOSAL_VIEWED", "QUOTE_PROPOSAL_SIGNED":
            guard parts.count == 3, parts[1] == "projets" else { return nil }
            return .projectQuotes(id)
        case "PHASE_VALIDATED", "PHASE_REVISION_REQUESTED", "CHANGE_REQUEST_CREATED", "TICKET_CREATED":
            guard parts.count == 3, parts[1] == "projets" else { return nil }
            return .project(id)
        default: return nil
        }
    }

    private static func valid(_ id: String) -> Bool {
        !id.isEmpty && id.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_" }
    }
}
