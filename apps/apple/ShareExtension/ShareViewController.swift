import SwiftUI
import UIKit
import UniformTypeIdentifiers
import CoreFoundation
import LocalAuthentication
import VenioCore
import VenioTheme

final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        let model = ShareModel(providers: providers)
        let host = UIHostingController(rootView: ShareView(model: model) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        })
        addChild(host)
        view.addSubview(host.view)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        host.didMove(toParent: self)
    }
}

@Observable @MainActor private final class ShareModel {
    let context = ShareInboxStore().readContext()
    var items: [ShareInboxItem] = []
    var projectId: String?
    var query = ""
    var loading = true
    var sent = false
    var errorKey: String?
    var unlocked = false
    var locked: Bool { context?.requiresUnlock == true && !unlocked }
    private let providers: [NSItemProvider]
    private let inbox = ShareInboxStore()
    private var recent = UserDefaults.standard.stringArray(forKey: "recentProjects") ?? []

    init(providers: [NSItemProvider]) { self.providers = providers }
    var projects: [ShareProject] {
        (context?.projects ?? []).filter {
            query.isEmpty || $0.name.localizedStandardContains(query) || $0.client.localizedStandardContains(query)
                || $0.projectNumber.localizedStandardContains(query)
        }.sorted { lhs, rhs in
            let left = recent.firstIndex(of: lhs.id) ?? 5
            let right = recent.firstIndex(of: rhs.id) ?? 5
            if left != right { return left < right }
            return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
        }
    }
    func load() async {
        guard let context else { loading = false; return }
        guard !providers.isEmpty, providers.count <= 10 else {
            loading = false; errorKey = "Partagez entre 1 et 10 fichiers."; return
        }
        do {
            for provider in providers {
                try Task.checkCancellation()
                let item = try await load(provider, context: context)
                items.append(item)
                try Task.checkCancellation()
            }
        } catch {
            discard()
            if !Task.isCancelled { errorKey = Self.message(error) }
        }
        loading = false
    }
    private func load(_ provider: NSItemProvider, context: ShareContext) async throws -> ShareInboxItem {
        guard let identifier = provider.registeredTypeIdentifiers.first(where: {
            guard let type = UTType($0) else { return false }
            return type.conforms(to: .data) && type != .fileURL
        }) else { throw VenioAPIError(code: "UNSUPPORTED_MEDIA_TYPE") }
        let suggestedName = provider.suggestedName
        let inbox = inbox
        return try await withCheckedThrowingContinuation { continuation in
            _ = provider.loadFileRepresentation(forTypeIdentifier: identifier) { url, error in
                do {
                    guard let url else { throw error ?? CocoaError(.fileReadUnknown) }
                    let name = suggestedName.flatMap { $0.isEmpty ? nil : $0 } ?? url.lastPathComponent
                    let fileExtension = URL(fileURLWithPath: name).pathExtension
                    let type = UTType(filenameExtension: fileExtension) ?? UTType(filenameExtension: url.pathExtension) ?? UTType(identifier)
                    guard let mimeType = type?.preferredMIMEType else { throw VenioAPIError(code: "UNSUPPORTED_MEDIA_TYPE") }
                    let item = ShareInboxItem(origin: context.origin, userId: context.userId, projectId: "",
                        title: URL(fileURLWithPath: name).deletingPathExtension().lastPathComponent,
                        fileName: name, mimeType: mimeType)
                    try inbox.stage(item: item, copying: url)
                    continuation.resume(returning: item)
                } catch { continuation.resume(throwing: error) }
            }
        }
    }
    func unlock() async {
        unlocked = (try? await LAContext().evaluatePolicy(.deviceOwnerAuthentication,
            localizedReason: String(localized: "Déverrouillez Venio pour choisir le projet."))) == true
    }
    func send() {
        guard !locked, let projectId, !loading, errorKey == nil, !items.isEmpty else { return }
        // L'app a pu se déconnecter ou activer son verrou depuis l'ouverture de la feuille.
        let current = inbox.readContext()
        guard let current, current.origin == context?.origin, current.userId == context?.userId,
              current.projects.contains(where: { $0.id == projectId }), !current.requiresUnlock || unlocked else {
            discard(); errorKey = "Ouvrez Venio pour vous connecter"; return
        }
        var committed: Set<UUID> = []
        do {
            for index in items.indices {
                items[index].projectId = projectId
                try DocumentTransport.validateFile(items[index].draft(fileURL: inbox.fileURL(for: items[index])))
            }
            for item in items {
                try inbox.commit(item: item)
                committed.insert(item.idempotencyKey)
            }
            recent = Array(([projectId] + recent.filter { $0 != projectId }).prefix(5))
            UserDefaults.standard.set(recent, forKey: "recentProjects")
            sent = true
            CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),
                CFNotificationName(ShareInboxStore.notificationName as CFString), nil, nil, true)
        } catch {
            // Les fichiers déjà publiés partent ; seuls les autres sont retirés.
            items.removeAll { committed.contains($0.idempotencyKey) }
            discard()
            errorKey = committed.isEmpty ? Self.message(error) : "Une partie des fichiers n’a pas pu être ajoutée."
        }
    }
    func discard() {
        guard !sent else { return }
        for item in items { try? inbox.remove(item.idempotencyKey) }
        items = []
    }
    private static func message(_ error: any Error) -> String {
        switch (error as? VenioAPIError)?.code {
        case "FILE_TOO_LARGE": "Le fichier dépasse la limite de 20 Mo."
        case "UNSUPPORTED_MEDIA_TYPE": "Ce type de fichier n’est pas accepté."
        default: "Impossible de préparer le partage. Réessayez."
        }
    }
}

private struct ShareView: View {
    @Bindable var model: ShareModel
    let close: () -> Void
    @State private var loadingTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            Group {
                if model.context == nil {
                    ContentUnavailableView("Ouvrez Venio pour vous connecter", systemImage: "person.crop.circle.badge.exclamationmark")
                } else if model.locked {
                    ContentUnavailableView {
                        Label("Venio est verrouillé", systemImage: "lock")
                    } actions: {
                        Button("Déverrouiller") { Task { await model.unlock() } }
                    }
                } else if model.sent {
                    ContentUnavailableView("Ajouté. Venio l’enverra dès son ouverture.", systemImage: "checkmark.circle")
                } else {
                    List {
                        if model.loading { ProgressView() }
                        if let key = model.errorKey { Text(LocalizedStringKey(key)).foregroundStyle(.red) }
                        Section("Documents") {
                            ForEach($model.items) { $item in
                                VStack(alignment: .leading) {
                                    Text(item.fileName).font(.caption).foregroundStyle(.secondary)
                                    TextField("Titre", text: $item.title)
                                }
                            }
                        }
                        Section("Projet") {
                            if model.projects.isEmpty { Text("Aucun projet disponible") }
                            ForEach(model.projects) { project in
                                Button { model.projectId = project.id } label: {
                                    HStack {
                                        VStack(alignment: .leading) {
                                            Text(project.name).foregroundStyle(.primary)
                                            Text(project.client + " · " + project.projectNumber)
                                                .font(.caption).foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        if model.projectId == project.id { Image(systemName: "checkmark") }
                                    }
                                }
                            }
                        }
                    }
                    .searchable(text: $model.query, prompt: "Nom, client ou numéro")
                }
            }
            .navigationTitle("Envoyer vers Venio")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { loadingTask?.cancel(); model.discard(); close() }
                }
                if model.context != nil && !model.sent && !model.locked {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Envoyer") { model.send() }
                            .disabled(model.loading || model.errorKey != nil || model.projectId == nil || model.items.isEmpty
                                || model.items.contains { $0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })
                    }
                }
            }
        }
        .tint(Color(red: 14 / 255, green: 165 / 255, blue: 233 / 255))
        .onAppear {
            loadingTask = Task {
                if model.locked { await model.unlock() }
                await model.load()
            }
        }
        .onDisappear { loadingTask?.cancel(); model.discard() }
        .task(id: model.sent) {
            if model.sent {
                try? await Task.sleep(for: .seconds(1.5))
                close()
            }
        }
    }
}
