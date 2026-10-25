#if !os(watchOS)
import SwiftUI
import Observation
import PhotosUI
import UniformTypeIdentifiers
import VenioCore
import VenioTheme
#if os(iOS)
import VisionKit
import PDFKit
import AVFoundation
#endif

@Observable @MainActor final class DocumentAcquisition {
    enum Source { case scanner, photos, files }
    var importing = false
    var pickingPhotos = false
    var scanning = false
    var photos: [PhotosPickerItem] = []
    var batch: DocumentBatch?
    var errorKey: String?
    var busy = false
    private var projectId = ""
    private var staged: [DocumentDraft] = []
    private var directories: [URL] = []

    func begin(_ source: Source, projectId: String) {
        self.projectId = projectId
        switch source {
        case .files: importing = true
        case .photos: pickingPhotos = true
        case .scanner:
            #if os(iOS)
            Task {
                if await AVCaptureDevice.requestAccess(for: .video) { scanning = true }
                else { errorKey = "Autorisez la caméra dans Réglages ou choisissez une photo." }
            }
            #endif
        }
    }
    func files(_ urls: [URL], projectId: String? = nil) {
        if let projectId { self.projectId = projectId }
        do {
            for url in urls {
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                let type = UTType(filenameExtension: url.pathExtension)
                let destination = try stagingURL(name: url.lastPathComponent)
                try FileManager.default.copyItem(at: url, to: destination)
                staged.append(DocumentDraft(projectId: self.projectId, title: url.deletingPathExtension().lastPathComponent,
                    fileName: url.lastPathComponent, mimeType: type?.preferredMIMEType ?? "application/octet-stream", fileURL: destination))
            }
            presentStaged()
        } catch { cleanup(); errorKey = mobileErrorKey(error) }
    }
    func loadPhotos(locale: Locale) async {
        guard !photos.isEmpty else { return }
        busy = true
        defer { busy = false; photos = [] }
        do {
            for (index, photo) in photos.enumerated() {
                guard let data = try await photo.loadTransferable(type: Data.self) else { throw VenioAPIError(code: "FILE_UNAVAILABLE") }
                try Task.checkCancellation()
                let type = photo.supportedContentTypes.first(where: { $0.conforms(to: .image) && $0.preferredFilenameExtension != nil }) ?? .jpeg
                let title = CommercialStrings.format("Photo %lld", locale: locale, index + 1)
                let name = title + "." + (type.preferredFilenameExtension ?? "jpg")
                let url = try stagingURL(name: name)
                try data.write(to: url, options: .atomic)
                staged.append(DocumentDraft(projectId: projectId, title: title, fileName: name,
                    mimeType: type.preferredMIMEType ?? "image/jpeg", fileURL: url))
            }
            presentStaged()
        } catch { cleanup(); errorKey = mobileErrorKey(error) }
    }
    #if os(iOS)
    func scanned(_ scan: VNDocumentCameraScan, locale: Locale) {
        do {
            let pdf = PDFDocument()
            for index in 0..<scan.pageCount {
                guard let page = PDFPage(image: scan.imageOfPage(at: index)) else { throw VenioAPIError(code: "FILE_UNAVAILABLE") }
                pdf.insert(page, at: index)
            }
            let formats = CommercialFormats(locale: locale)
            let title = CommercialStrings.format("Scan %@", locale: locale, formats.date(.now, template: "dMMMyyyy") + " " + formats.time(.now))
            let url = try stagingURL(name: title + ".pdf")
            guard pdf.write(to: url) else { throw VenioAPIError(code: "FILE_UNAVAILABLE") }
            staged = [DocumentDraft(projectId: projectId, title: title, fileName: url.lastPathComponent, mimeType: "application/pdf", fileURL: url)]
        } catch { cleanup(); errorKey = mobileErrorKey(error) }
        scanning = false
    }
    #endif
    func presentStaged() {
        guard !staged.isEmpty else { return }
        batch = DocumentBatch(drafts: staged)
        staged = []
    }
    func cleanup() {
        for directory in directories { try? FileManager.default.removeItem(at: directory) }
        directories = []
        staged = []
    }
    private func stagingURL(name: String) throws -> URL {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("VenioImports/" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        directories.append(directory)
        return directory.appendingPathComponent(URL(fileURLWithPath: name).lastPathComponent)
    }
}

struct DocumentBatch: Identifiable {
    let id = UUID()
    var drafts: [DocumentDraft]
}

struct DocumentSourceActions: View {
    let acquisition: DocumentAcquisition
    let projectId: String
    var body: some View {
        #if os(iOS)
        if VNDocumentCameraViewController.isSupported {
            Button { acquisition.begin(.scanner, projectId: projectId) } label: {
                Label { VText("Scanner") } icon: { Image(systemName: "doc.viewfinder") }
            }
        }
        #endif
        Button { acquisition.begin(.photos, projectId: projectId) } label: {
            Label { VText("Photos") } icon: { Image(systemName: "photo.on.rectangle") }
        }
        Button { acquisition.begin(.files, projectId: projectId) } label: {
            Label { VText("Fichiers") } icon: { Image(systemName: "folder") }
        }
    }
}

private struct DocumentAcquisitionModifier: ViewModifier {
    @Environment(\.locale) private var locale
    @Bindable var acquisition: DocumentAcquisition
    func body(content: Content) -> some View {
        content
            .fileImporter(isPresented: $acquisition.importing, allowedContentTypes: [.data], allowsMultipleSelection: true) { result in
                switch result {
                case .success(let urls): acquisition.files(urls)
                case .failure(let error): acquisition.errorKey = mobileErrorKey(error)
                }
            }
            .photosPicker(isPresented: $acquisition.pickingPhotos, selection: $acquisition.photos, matching: .images)
            .task(id: acquisition.photos) { await acquisition.loadPhotos(locale: locale) }
            .sheet(item: $acquisition.batch, onDismiss: { acquisition.cleanup() }) { batch in
                AddDocumentsView(drafts: batch.drafts)
            }
            #if os(iOS)
            .sheet(isPresented: $acquisition.scanning, onDismiss: { acquisition.presentStaged() }) {
                DocumentCamera { scan in acquisition.scanned(scan, locale: locale) } onCancel: {
                    acquisition.scanning = false
                } onFailure: { error in
                    acquisition.errorKey = mobileErrorKey(error)
                    acquisition.scanning = false
                }.ignoresSafeArea()
            }
            #endif
            .overlay { if acquisition.busy { ProgressView { VText("Préparation des documents") }.padding().venioCard() } }
            .alert(CommercialStrings.text("Ajout impossible", locale: locale), isPresented: Binding(get: { acquisition.errorKey != nil }, set: { if !$0 { acquisition.errorKey = nil } })) {
                Button { acquisition.errorKey = nil } label: { VText("Fermer") }
            } message: { if let key = acquisition.errorKey { VText(key) } }
    }
}

extension View {
    func documentAcquisition(_ acquisition: DocumentAcquisition) -> some View { modifier(DocumentAcquisitionModifier(acquisition: acquisition)) }
}

private struct AddDocumentsView: View {
    @Environment(CommercialStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale
    @State var drafts: [DocumentDraft]
    // Les brouillons ne sont jamais retirés pendant l'envoi : un champ de titre encore en édition écrirait sur un index disparu.
    @State private var uploaded: Set<UUID> = []
    @State private var busy = false
    @State private var errorKey: String?
    var body: some View {
        NavigationStack {
            Form {
                ForEach($drafts) { $draft in
                    Section {
                        TextField(CommercialStrings.text("Titre", locale: locale), text: $draft.title)
                            .disabled(uploaded.contains(draft.id))
                        Text(verbatim: draft.fileName).font(.caption)
                        if store.canPublishDocuments {
                            Toggle(isOn: $draft.clientVisible) { VText("Visible par le client") }
                        }
                    }
                }
                if let errorKey { MobileErrorView(key: errorKey) }
            }
            .navigationTitle(CommercialStrings.text("Ajouter des documents", locale: locale))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { VText("Annuler") }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    Button { add() } label: {
                        if busy { ProgressView() } else { VText("Ajouter") }
                    }.disabled(busy || !store.canManageDocuments || drafts.contains { $0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })
                }
            }
        }
        .interactiveDismissDisabled(busy)
        .frame(minWidth: 320, minHeight: 280)
    }
    private func add() {
        busy = true
        errorKey = nil
        Task {
            do {
                for draft in drafts where !uploaded.contains(draft.id) {
                    try await store.uploadDocuments([draft])
                    uploaded.insert(draft.id)
                }
                dismiss()
            } catch { errorKey = mobileErrorKey(error) }
            busy = false
        }
    }
}

#if os(iOS)
private struct DocumentCamera: UIViewControllerRepresentable {
    let onScan: (VNDocumentCameraScan) -> Void
    let onCancel: () -> Void
    let onFailure: (any Error) -> Void
    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let controller = VNDocumentCameraViewController()
        controller.delegate = context.coordinator
        return controller
    }
    func updateUIViewController(_ controller: VNDocumentCameraViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let parent: DocumentCamera
        init(parent: DocumentCamera) { self.parent = parent }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) { parent.onScan(scan) }
        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) { parent.onCancel() }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: any Error) { parent.onFailure(error) }
    }
}
#endif
#endif
