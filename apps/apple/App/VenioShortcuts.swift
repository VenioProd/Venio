import AppIntents
import VenioCommercial

struct VenioAppIntents: AppIntentsPackage {
    static var includedPackages: [any AppIntentsPackage.Type] { [VenioIntentsPackage.self] }
}

struct VenioShortcuts: AppShortcutsProvider {
    static let shortcutTileColor: ShortcutTileColor = .blue
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: NewLeadIntent(), phrases: ["Créer un lead avec \(.applicationName)"],
            shortTitle: "Nouveau lead", systemImageName: "person.badge.plus")
        AppShortcut(intent: PlanFollowUpIntent(), phrases: ["Planifier une relance avec \(.applicationName)"],
            shortTitle: "Planifier une relance", systemImageName: "clock.arrow.circlepath")
        AppShortcut(intent: AddProjectDocumentIntent(), phrases: ["Ajouter un document avec \(.applicationName)"],
            shortTitle: "Ajouter un document", systemImageName: "doc.badge.plus")
        AppShortcut(intent: OpenTodayIntent(), phrases: ["Ouvrir Aujourd’hui dans \(.applicationName)"],
            shortTitle: "Ouvrir Aujourd’hui", systemImageName: "sun.max")
    }
}
