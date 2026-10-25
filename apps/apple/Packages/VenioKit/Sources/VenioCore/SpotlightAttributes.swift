import Foundation

public struct SpotlightAttributes: Sendable, Equatable {
    public let identifier: String
    public let domain: String
    public let title: String
    public let summary: String
    public let keywords: [String]

    public init(lead: Lead) {
        identifier = "lead:" + lead.id
        domain = "paris.venio.lead"
        title = lead.company
        summary = [lead.contactName, lead.serviceType].filter { !$0.isEmpty }.joined(separator: " · ")
        keywords = [lead.company, lead.contactName, lead.serviceType].filter { !$0.isEmpty }
    }

    public init(project: Project) {
        identifier = "project:" + project.id
        domain = "paris.venio.project"
        title = project.name
        summary = [project.client, project.projectNumber].filter { !$0.isEmpty }.joined(separator: " · ")
        keywords = [project.client, project.name, project.projectNumber].filter { !$0.isEmpty }
    }
}
