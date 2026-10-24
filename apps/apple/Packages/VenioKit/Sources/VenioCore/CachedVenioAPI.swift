import Foundation
import SwiftData

@Model public final class CachedLead {
    @Attribute(.unique) public var id: String
    public var data: Data
    public var syncedAt: Date

    public init(id: String, data: Data, syncedAt: Date) {
        self.id = id
        self.data = data
        self.syncedAt = syncedAt
    }
}

@Model public final class CachedProject {
    @Attribute(.unique) public var id: String
    public var data: Data
    public var syncedAt: Date

    public init(id: String, data: Data, syncedAt: Date) {
        self.id = id
        self.data = data
        self.syncedAt = syncedAt
    }
}

@ModelActor public actor VenioCache {
    public func save(leads: [Lead]) throws {
        let encoded = try leads.map { ($0.id, try JSONEncoder().encode($0)) }
        do {
            try modelContext.delete(model: CachedLead.self)
            for (id, data) in encoded {
                modelContext.insert(CachedLead(id: id, data: data, syncedAt: .now))
            }
            try modelContext.save()
        } catch {
            modelContext.rollback()
            throw error
        }
    }

    public func leads() throws -> [Lead] {
        try modelContext.fetch(FetchDescriptor<CachedLead>(sortBy: [SortDescriptor(\.id)]))
            .map { try JSONDecoder().decode(Lead.self, from: $0.data) }
    }

    public func save(projects: [Project]) throws {
        let encoded = try projects.map { ($0.id, try JSONEncoder().encode($0)) }
        do {
            try modelContext.delete(model: CachedProject.self)
            for (id, data) in encoded {
                modelContext.insert(CachedProject(id: id, data: data, syncedAt: .now))
            }
            try modelContext.save()
        } catch {
            modelContext.rollback()
            throw error
        }
    }

    public func projects() throws -> [Project] {
        try modelContext.fetch(FetchDescriptor<CachedProject>(sortBy: [SortDescriptor(\.id)]))
            .map { try JSONDecoder().decode(Project.self, from: $0.data) }
    }
}

public struct CachedVenioAPI: VenioAPI {
    private let upstream: any VenioAPI
    private let cache: VenioCache

    public init(upstream: any VenioAPI, container: ModelContainer) {
        self.upstream = upstream
        self.cache = VenioCache(modelContainer: container)
    }

    public func leads() async throws -> [Lead] {
        let result: [Lead]
        do { result = try await upstream.leads() }
        catch {
            let cached = try await cache.leads()
            guard !cached.isEmpty else { throw error }
            return cached
        }
        try? await cache.save(leads: result)
        return result
    }

    public func projects() async throws -> [Project] {
        let result: [Project]
        do { result = try await upstream.projects() }
        catch {
            let cached = try await cache.projects()
            guard !cached.isEmpty else { throw error }
            return cached
        }
        try? await cache.save(projects: result)
        return result
    }

    public func createLead(_ draft: LeadDraft) async throws -> Lead { try await upstream.createLead(draft) }
    public func registerPushToken(_ token: String, environment: PushEnvironment, language: String?) async throws {
        try await upstream.registerPushToken(token, environment: environment, language: language)
    }
    public func unregisterPushToken() async throws { try await upstream.unregisterPushToken() }
    public func quoteTemplates() async throws -> [QuoteTemplate] { try await upstream.quoteTemplates() }
    public func createQuote(templateId: String, projectId: String, title: String?) async throws -> QuoteProposal {
        try await upstream.createQuote(templateId: templateId, projectId: projectId, title: title)
    }
    public func sendQuote(id: String) async throws -> QuoteProposal { try await upstream.sendQuote(id: id) }
    public func createInteraction(_ draft: InteractionDraft) async throws -> TimelineEntry { try await upstream.createInteraction(draft) }
    public func updateLead(id: String, patch: LeadPatch) async throws -> Lead { try await upstream.updateLead(id: id, patch: patch) }
    public func currentUser() async throws -> UserSummary { try await upstream.currentUser() }
    public func lead(id: String) async throws -> Lead {
        do { return try await upstream.lead(id: id) }
        catch {
            guard let lead = try await cache.leads().first(where: { $0.id == id }) else { throw error }
            return lead
        }
    }
    public func timeline(leadId: String) async throws -> [TimelineEntry] { try await upstream.timeline(leadId: leadId) }
    public func quotes() async throws -> [QuoteProposal] { try await upstream.quotes() }
    public func appointments() async throws -> [Appointment] { try await upstream.appointments() }
    public func project(id: String) async throws -> ProjectDetail { try await upstream.project(id: id) }
}
