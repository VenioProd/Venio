import SwiftUI
import Observation
import WatchKit
import WatchConnectivity
import UserNotifications
import VenioCore
import VenioCommercial
import VenioTheme

@Observable @MainActor final class QuoteNotificationContent {
    var title = ""
    var message = ""
    var phoneURL: URL?
}

final class QuoteNotificationController: WKUserNotificationHostingController<QuoteNotificationView> {
    private let content = QuoteNotificationContent()
    private let themes = ThemeManager()
    private let api = MockVenioAPI()
    override class var isInteractive: Bool { true }
    override var body: QuoteNotificationView { QuoteNotificationView(content: content, themes: themes) }
    override func didReceive(_ notification: UNNotification) {
        let payload = notification.request.content
        content.title = payload.title
        content.message = payload.body
        content.phoneURL = nil
        let link = DeepLink.parse(type: payload.userInfo["type"] as? String ?? "", link: payload.userInfo["link"] as? String)
        let live = (WCSession.default.receivedApplicationContext["backend"] as? String).map { $0 == "live" }
            ?? ((try? BackendConfiguration().backend) != .mock)
        if live {
            let data = WCSession.default.receivedApplicationContext["quotePhones"] as? Data
            let phones = data.flatMap { try? JSONDecoder().decode([WatchQuotePhone].self, from: $0) } ?? []
            content.phoneURL = WatchQuotePhones.phoneURL(for: link, in: phones)
            return
        }
        Task { @MainActor in
            do {
                let quotes = try await api.quotes()
                let matching: [QuoteProposal]
                switch link {
                case .quote(let id): matching = quotes.filter { $0.id == id }
                case .projectQuotes(let id): matching = quotes.filter { $0.project == id }
                default: matching = []
                }
                let clients = Set(matching.compactMap(\.client))
                let leads = try await api.leads().filter { clients.contains($0.clientAccountId ?? "") || clients.contains($0.company) }
                if leads.count == 1 { content.phoneURL = leads.first?.phoneURL }
            } catch { content.phoneURL = nil }
        }
    }
}

struct QuoteNotificationView: View {
    let content: QuoteNotificationContent
    let themes: ThemeManager
    var body: some View {
        ThemeHost(manager: themes) {
            VStack(alignment: .leading, spacing: 10) {
                Text(verbatim: content.title).font(.headline)
                Text(verbatim: content.message)
                if let url = content.phoneURL {
                    Button { WKApplication.shared().openSystemURL(url) } label: { Text("Appeler", bundle: .main) }
                        .venioPrimaryButton()
                }
            }.padding().background { ThemedBackground() }
        }
    }
}
