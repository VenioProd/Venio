#if !os(watchOS)
import AppIntents
import Foundation
import UniformTypeIdentifiers
import VenioCore

@MainActor public enum IntentBridge {
    private static weak var store: CommercialStore?
    private static weak var session: SessionModel?
    public static var locale = Locale.current

    public static func connect(store: CommercialStore?, session: SessionModel?) {
        self.store = store
        self.session = session
    }
    static func disconnect(store: CommercialStore) {
        if self.store === store { self.store = nil; session = nil }
    }
    static func currentStore() throws -> CommercialStore {
        guard let store, store.hasLoaded, let user = store.currentUser else {
            throw IntentFailure(key: "Connectez-vous à Venio avant d’utiliser ce raccourci.")
        }
        guard !AppLock.shared.requiresAuthentication else {
            throw IntentFailure(key: "Déverrouillez Venio avant d’utiliser ce raccourci.")
        }
        if let session, session.commercial !== store {
            throw IntentFailure(key: "Connectez-vous à Venio avant d’utiliser ce raccourci.")
        }
        guard user.role == .commercial else { throw IntentFailure(key: "Vous n’avez pas les droits nécessaires pour cette action.") }
        return store
    }
    static func readyStore() async throws -> CommercialStore {
        if let session {
            await session.start()
            while session.starting { try await Task.sleep(for: .milliseconds(100)) }
        }
        if let store {
            if !store.hasLoaded { await store.load() }
            while store.isLoading { try await Task.sleep(for: .milliseconds(100)) }
        }
        return try currentStore()
    }
    static func require(_ permission: String, in store: CommercialStore) throws {
        guard store.currentUser?.permissions.contains(permission) == true else {
            throw IntentFailure(key: "Vous n’avez pas les droits nécessaires pour cette action.")
        }
    }
}

private struct IntentFailure: LocalizedError {
    let key: String
    let language: Locale
    @MainActor init(key: String) { self.key = key; language = IntentBridge.locale }
    var errorDescription: String? { CommercialStrings.text(key, locale: language) }
}

public struct VenioIntentsPackage: AppIntentsPackage {}

public struct LeadEntity: AppEntity {
    public static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: LocalizedStringResource("Lead"))
    }
    public static var defaultQuery: LeadEntityQuery { LeadEntityQuery() }
    public let id: String
    public let company: String
    public var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(company)") }
    init(_ lead: Lead) { id = lead.id; company = lead.company }
}

public struct LeadEntityQuery: EntityStringQuery {
    public static var allowedExecutionTargets: IntentExecutionTargets { .main }
    public init() {}
    @MainActor private func available() throws -> [Lead] {
        let store = try IntentBridge.currentStore()
        try IntentBridge.require("view_crm", in: store)
        try IntentBridge.require("manage_crm", in: store)
        return store.leads.filter { store.canEditLead($0) }
    }
    public func entities(for identifiers: [String]) async throws -> [LeadEntity] {
        try await available().filter { identifiers.contains($0.id) }.map(LeadEntity.init)
    }
    public func suggestedEntities() async throws -> [LeadEntity] { try await available().map(LeadEntity.init) }
    public func entities(matching string: String) async throws -> [LeadEntity] {
        try await available().filter { $0.company.localizedStandardContains(string) }.map(LeadEntity.init)
    }
}

public struct ProjectEntity: AppEntity {
    public static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: LocalizedStringResource("Projet"))
    }
    public static var defaultQuery: ProjectEntityQuery { ProjectEntityQuery() }
    public let id: String
    public let name: String
    public let client: String
    public var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(client)") }
    init(_ project: Project) { id = project.id; name = project.name; client = project.clientName }
}

public struct ProjectEntityQuery: EntityStringQuery {
    public static var allowedExecutionTargets: IntentExecutionTargets { .main }
    public init() {}
    @MainActor private func available() throws -> [Project] {
        let store = try IntentBridge.currentStore()
        try IntentBridge.require("view_projects", in: store)
        guard store.canManageDocuments else { throw IntentFailure(key: "Vous n’avez pas les droits nécessaires pour cette action.") }
        return store.projects
    }
    public func entities(for identifiers: [String]) async throws -> [ProjectEntity] {
        try await available().filter { identifiers.contains($0.id) }.map(ProjectEntity.init)
    }
    public func suggestedEntities() async throws -> [ProjectEntity] { try await available().map(ProjectEntity.init) }
    public func entities(matching string: String) async throws -> [ProjectEntity] {
        try await available().filter { $0.name.localizedStandardContains(string) || $0.client.localizedStandardContains(string) }.map(ProjectEntity.init)
    }
}

public struct NewLeadIntent: AppIntent {
    public static var title: LocalizedStringResource { LocalizedStringResource("Nouveau lead") }
    public static var supportedModes: IntentModes { .foreground }
    public static var allowedExecutionTargets: IntentExecutionTargets { .main }
    public static var authenticationPolicy: IntentAuthenticationPolicy { .requiresLocalDeviceAuthentication }
    @Parameter(title: LocalizedStringResource("Société")) public var company: String
    @Parameter(title: LocalizedStringResource("Contact")) public var contact: String?
    public init() {}
    @MainActor public func perform() async throws -> some IntentResult {
        let store = try await IntentBridge.readyStore()
        try IntentBridge.require("manage_crm", in: store)
        guard !company.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw IntentFailure(key: "Indiquez le nom de la société.")
        }
        do {
            _ = try await store.createLead(LeadDraft(company: company, contactName: contact ?? "", assignedTo: store.currentUser?.id))
        } catch { throw IntentFailure(key: mobileErrorKey(error)) }
        return .result()
    }
}

public struct PlanFollowUpIntent: AppIntent {
    public static var title: LocalizedStringResource { LocalizedStringResource("Planifier une relance") }
    public static var supportedModes: IntentModes { .foreground }
    public static var allowedExecutionTargets: IntentExecutionTargets { .main }
    public static var authenticationPolicy: IntentAuthenticationPolicy { .requiresLocalDeviceAuthentication }
    @Parameter(title: LocalizedStringResource("Lead")) public var lead: LeadEntity
    @Parameter(title: LocalizedStringResource("Date et heure")) public var date: Date
    public init() {}
    @MainActor public func perform() async throws -> some IntentResult {
        let store = try await IntentBridge.readyStore()
        try IntentBridge.require("view_crm", in: store)
        guard let current = store.lead(for: lead.id), store.canEditLead(current) else {
            throw IntentFailure(key: "Vous n’avez pas les droits nécessaires pour cette action.")
        }
        do { try await store.updateLead(id: current.id, patch: LeadPatch(nextActionAt: .set(date))) }
        catch { throw IntentFailure(key: mobileErrorKey(error)) }
        return .result()
    }
}

public struct AddProjectDocumentIntent: AppIntent {
    public static var title: LocalizedStringResource { LocalizedStringResource("Ajouter un document à un projet") }
    public static var supportedModes: IntentModes { .foreground }
    public static var allowedExecutionTargets: IntentExecutionTargets { .main }
    public static var authenticationPolicy: IntentAuthenticationPolicy { .requiresLocalDeviceAuthentication }
    @Parameter(title: LocalizedStringResource("Projet")) public var project: ProjectEntity
    @Parameter(title: LocalizedStringResource("Fichier")) public var file: IntentFile
    public init() {}
    @MainActor public func perform() async throws -> some IntentResult {
        let store = try await IntentBridge.readyStore()
        try IntentBridge.require("view_projects", in: store)
        guard store.canManageDocuments, store.projects.contains(where: { $0.id == project.id }) else {
            throw IntentFailure(key: "Vous n’avez pas les droits nécessaires pour cette action.")
        }
        do {
            // La file copie ce fichier dans son dossier durable avant le retour de uploadDocuments.
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("VenioImports/" + UUID().uuidString)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(at: directory) }
            let filename = URL(fileURLWithPath: file.filename).lastPathComponent
            let destination = directory.appendingPathComponent(filename)
            if let source = file.fileURL {
                let access = source.startAccessingSecurityScopedResource()
                defer { if access { source.stopAccessingSecurityScopedResource() } }
                try FileManager.default.copyItem(at: source, to: destination)
            } else { try file.data.write(to: destination, options: .atomic) }
            let current = try IntentBridge.currentStore()
            guard current === store else { throw VenioAPIError(code: "SIGNED_OUT") }
            let type = file.type ?? UTType(filenameExtension: destination.pathExtension)
            try await store.uploadDocuments([DocumentDraft(projectId: project.id,
                title: destination.deletingPathExtension().lastPathComponent, fileName: filename,
                mimeType: type?.preferredMIMEType ?? "application/octet-stream", fileURL: destination)])
        } catch { throw IntentFailure(key: mobileErrorKey(error)) }
        return .result()
    }
}

public struct OpenTodayIntent: AppIntent {
    public static var title: LocalizedStringResource { LocalizedStringResource("Ouvrir Aujourd’hui") }
    public static var supportedModes: IntentModes { .foreground }
    public static var allowedExecutionTargets: IntentExecutionTargets { .main }
    public static var authenticationPolicy: IntentAuthenticationPolicy { .requiresLocalDeviceAuthentication }
    public init() {}
    @MainActor public func perform() async throws -> some IntentResult {
        let store = try await IntentBridge.readyStore()
        await store.open(.today)
        return .result()
    }
}
#endif
