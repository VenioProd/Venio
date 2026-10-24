#if os(iOS)
import SwiftUI
import PhotosUI
import VisionKit
import Vision
import AVFoundation
import VenioCore

struct BusinessCardScanner: View {
    @Environment(\.locale) private var locale
    @Environment(\.openURL) private var openURL
    @State private var photo: PhotosPickerItem?
    @State private var scanning = false
    @State private var busy = false
    @State private var denied = false
    @State private var failed = false
    let onCard: (BusinessCard) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                Button {
                    Task { @MainActor in
                        if await AVCaptureDevice.requestAccess(for: .video) { scanning = true }
                        else { denied = true }
                    }
                } label: { Label { VText("Scanner une carte") } icon: { Image(systemName: "viewfinder") } }
            }
            PhotosPicker(selection: $photo, matching: .images) {
                Label { VText("Choisir une photo") } icon: { Image(systemName: "photo") }
            }.disabled(busy)
            if busy { ProgressView { VText("Lecture de la carte") } }
            if denied {
                VText("Autorisez la caméra dans Réglages ou choisissez une photo.")
                Button { if let url = permissionSettingsURL { openURL(url) } } label: { VText("Ouvrir Réglages") }
            }
            if failed { VText("Lecture impossible. Choisissez une autre photo ou saisissez les champs.") }
        }
        .sheet(isPresented: $scanning) {
            LiveCardScanner { lines in
                apply(lines)
                scanning = false
            } onFailure: {
                failed = true
                scanning = false
            }
        }
        .task(id: photo) {
            guard let photo else { return }
            busy = true
            failed = false
            defer { busy = false }
            do {
                guard let data = try await photo.loadTransferable(type: Data.self) else { failed = true; return }
                let lines = try await Self.recognize(data)
                try Task.checkCancellation()
                apply(lines)
            } catch is CancellationError { return }
            catch { failed = true }
        }
    }
    private func apply(_ lines: [String]) {
        guard !lines.isEmpty else { failed = true; return }
        onCard(BusinessCardParser.parse(lines: lines))
    }
    nonisolated private static func recognize(_ data: Data) async throws -> [String] {
        try await Task.detached(priority: .userInitiated) {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["fr-FR", "en-US"]
            request.usesLanguageCorrection = true
            try VNImageRequestHandler(data: data).perform([request])
            return (request.results ?? []).sorted { $0.boundingBox.midY > $1.boundingBox.midY }
                .compactMap { $0.topCandidates(1).first?.string }
        }.value
    }
}

private struct LiveCardScanner: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale
    @State private var lines: [String] = []
    let onRead: ([String]) -> Void
    let onFailure: () -> Void
    var body: some View {
        NavigationStack {
            ScannerCamera(lines: $lines, onFailure: onFailure).ignoresSafeArea(edges: .bottom)
                .navigationTitle(CommercialStrings.text("Carte de visite", locale: locale))
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button { dismiss() } label: { VText("Fermer") } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button { onRead(lines) } label: { VText("Utiliser ces champs") }.disabled(lines.isEmpty)
                    }
                }
        }
    }
}

private struct ScannerCamera: UIViewControllerRepresentable {
    @Binding var lines: [String]
    let onFailure: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(recognizedDataTypes: [.text(languages: ["fr-FR", "en-US"])],
            qualityLevel: .accurate, recognizesMultipleItems: true, isGuidanceEnabled: true, isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        do { try scanner.startScanning() }
        catch { Task { @MainActor in onFailure() } }
        return scanner
    }
    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}
    static func dismantleUIViewController(_ controller: DataScannerViewController, coordinator: Coordinator) { controller.stopScanning() }
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let parent: ScannerCamera
        init(_ parent: ScannerCamera) { self.parent = parent }
        func dataScanner(_ scanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) { update(allItems) }
        func dataScanner(_ scanner: DataScannerViewController, didUpdate updatedItems: [RecognizedItem], allItems: [RecognizedItem]) { update(allItems) }
        func dataScanner(_ scanner: DataScannerViewController, didRemove removedItems: [RecognizedItem], allItems: [RecognizedItem]) { update(allItems) }
        func dataScanner(_ scanner: DataScannerViewController, becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable) { parent.onFailure() }
        private func update(_ items: [RecognizedItem]) {
            parent.lines = items.sorted { $0.bounds.topLeft.y < $1.bounds.topLeft.y }.compactMap {
                if case .text(let text) = $0 { return text.transcript }
                return nil
            }
        }
    }
}
#endif
