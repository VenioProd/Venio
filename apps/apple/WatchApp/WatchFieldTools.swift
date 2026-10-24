import SwiftUI
import VenioCore
import VenioTheme

struct WatchFieldTools: View {
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    @Bindable var bridge: WatchBridge
    @State private var showingNote = false
    @State private var text = ""
    @State private var noteLeadID = ""
    @State private var noteCompany = ""
    @State private var noteContact = ""
    @State private var queued = false
    @State private var failed = false
    var body: some View {
        VStack(spacing: 8) {
            if bridge.leadID != nil {
                Button {
                    text = ""
                    noteLeadID = bridge.leadID ?? ""
                    noteCompany = bridge.company
                    noteContact = bridge.contact
                    queued = false
                    showingNote = true
                } label: { Text(verbatim: localized("Note pour %@", bridge.company)) }
                .venioPrimaryButton()
                if queued { Text(verbatim: localized("Note en attente de transmission à l’iPhone")) }
            }
            if failed || bridge.failed { Text(verbatim: localized("Transmission Watch impossible")) }
        }.font(.caption)
        .padding(6)
        .frame(maxWidth: .infinity)
        .background(palette.base.color)
        .sheet(isPresented: $showingNote) {
            VStack {
                Text(verbatim: noteCompany).font(.headline)
                Text(verbatim: noteContact).font(.caption)
                TextField(localized("Dicter une note"), text: $text)
                Button {
                    if bridge.sendNote(text, leadID: noteLeadID) { queued = true; failed = false; showingNote = false }
                    else { failed = true }
                } label: { Text(verbatim: localized("Envoyer à l’iPhone")) }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button { showingNote = false } label: { Text(verbatim: localized("Fermer")) }
            }.padding()
        }
    }
    private func localized(_ key: String, _ value: String? = nil) -> String {
        let language = locale.language.languageCode?.identifier == "fr" ? "fr" : "en"
        let bundle = Bundle.main.path(forResource: language, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
        let template = bundle.localizedString(forKey: key, value: nil, table: "Localizable")
        guard let value else { return template }
        return String(format: template, locale: locale, value)
    }
}
