#if !os(watchOS)
import SwiftUI
import QuickLook
import CoreTransferable
import UniformTypeIdentifiers
import VenioCore
import VenioTheme

struct ProjectDocumentsView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.venioSession) private var session
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    @State private var previewURL: URL?
    @State private var deleting: ProjectDocument?
    @State private var retrying: ProjectDocument?
    @State private var errorKey: String?
    let projectId: String
    private var documents: [ProjectDocument] { store.projectDocuments[projectId, default: []] }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeading(title: "Documents", count: documents.count)
            ForEach(documents) { document in
                DocumentRow(document: document) { url in previewURL = url } onDelete: {
                    deleting = document
                } onRetry: {
                    if let key = document.pendingKey, let write = session?.pending.first(where: { $0.id == key }),
                       (write.lastStatus ?? 0) >= 500 || write.lastError == "UNCERTAIN_WRITE" {
                        retrying = document
                    } else { retry(document) }
                } onError: { errorKey = mobileErrorKey($0) }
                if document.id != documents.last?.id { Divider() }
            }
            if documents.isEmpty {
                VText("Aucun document").foregroundStyle(palette.textSecondary.color)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).venioCard()
        .quickLookPreview($previewURL)
        .task(id: session?.sendingWriteID) {
            do { try await store.reloadDocuments(projectId: projectId) }
            catch { if !Task.isCancelled { errorKey = mobileErrorKey(error) } }
        }
        .confirmationDialog(CommercialStrings.text("Supprimer ce document ?", locale: locale), isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            if let document = deleting {
                Button(role: .destructive) {
                    Task {
                        do { try await store.deleteDocument(document); _ = await session?.reloadPending() }
                        catch { errorKey = mobileErrorKey(error) }
                    }
                    deleting = nil
                } label: { VText("Supprimer") }
            }
            Button(role: .cancel) { deleting = nil } label: { VText("Annuler") }
        }
        .alert(CommercialStrings.text("Résultat incertain : vérifiez la fiche avant de réessayer", locale: locale), isPresented: Binding(get: { retrying != nil }, set: { if !$0 { retrying = nil } })) {
            Button { if let document = retrying { retry(document) }; retrying = nil } label: { VText("Réessayer") }
            Button(role: .cancel) { retrying = nil } label: { VText("Annuler") }
        } message: { VText("Vérifiez la fiche avant de réessayer. Réessayer utilisera une nouvelle clé d’idempotence.") }
        .alert(CommercialStrings.text("Opération impossible. Réessayez.", locale: locale), isPresented: Binding(get: { errorKey != nil }, set: { if !$0 { errorKey = nil } })) {
            Button { errorKey = nil } label: { VText("Fermer") }
        } message: { if let errorKey { VText(errorKey) } }
    }
    private func retry(_ document: ProjectDocument) {
        guard let key = document.pendingKey, let session else { return }
        Task { await session.retry(key) }
    }
}

private struct DocumentRow: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.venioSession) private var session
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    let document: ProjectDocument
    let onPreview: (URL) -> Void
    let onDelete: () -> Void
    let onRetry: () -> Void
    let onError: (any Error) -> Void
    private var sending: Bool { document.pendingKey != nil && session?.sendingWriteID == document.pendingKey }
    private var icon: String {
        if document.mimeType == "application/pdf" { return "doc.richtext" }
        if document.mimeType.hasPrefix("image/") { return "photo" }
        return "doc"
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { preview() } label: {
                HStack(spacing: 14) {
                    Image(systemName: icon).font(.title2).foregroundStyle(palette.accentText.color)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(verbatim: CommercialStrings.text(document.title, locale: locale)).font(.headline)
                        Text(verbatim: subtitle).font(.caption).foregroundStyle(palette.textSecondary.color)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(palette.textSecondary.color)
                }.contentShape(Rectangle())
            }.buttonStyle(.plain)
            HStack {
                CommercialBadge(text: CommercialStrings.text(document.clientVisible ? "Visible par le client" : "Interne", locale: locale))
                if sending {
                    ProgressView().controlSize(.small)
                    VText("Envoi…").font(.caption)
                } else if let state = document.deliveryState {
                    CommercialBadge(text: CommercialStrings.text(state == "failed" ? "Échec" : "En attente", locale: locale), tone: state == "failed" ? .urgent : .warning)
                    if state == "failed", session != nil {
                        Button(action: onRetry) { VText("Réessayer") }.font(.caption)
                    }
                }
            }
            if document.deliveryState == "failed", let key = document.pendingKey,
               let code = session?.pending.first(where: { $0.id == key })?.lastError {
                MobileErrorView(key: mobileErrorKey(VenioAPIError(code: code)))
            }
        }
        .contextMenu {
            Button { preview() } label: { Label { VText("Aperçu") } icon: { Image(systemName: "eye") } }
            ShareLink(item: ShareableDocument(fileName: document.fileName, load: { try await store.documentFile(document) }),
                      preview: SharePreview(Text(verbatim: document.title))) {
                Label { VText("Partager") } icon: { Image(systemName: "square.and.arrow.up") }
            }
            if store.canDelete(document) {
                Button(role: .destructive, action: onDelete) { Label { VText("Supprimer") } icon: { Image(systemName: "trash") } }.disabled(sending)
            }
        }
    }
    private var subtitle: String {
        let date = CommercialFormats(locale: locale).date(document.uploadedAt)
        guard let size = document.size else { return date }
        return date + " · " + Int64(size).formatted(.byteCount(style: .file).locale(locale))
    }
    private func preview() {
        Task {
            do {
                let url = try await store.documentFile(document)
                onPreview(url)
            } catch { onError(error) }
        }
    }
}
private struct ShareableDocument: Transferable {
    let fileName: String
    let load: @Sendable () async throws -> URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .item) { document in
            SentTransferredFile(try await document.load())
        }.suggestedFileName { $0.fileName }
    }
}
#endif
