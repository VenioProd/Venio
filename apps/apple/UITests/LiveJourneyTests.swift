import XCTest

/// Parcours de bout en bout contre un backend local, lancé étape par étape (voir README) :
/// on coupe le serveur entre l'étape 1 et l'étape 2, puis on le relance avant l'étape 3.
@MainActor final class LiveJourneyTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() async throws {
        continueAfterFailure = false
        let env = ProcessInfo.processInfo.environment
        app = XCUIApplication()
        app.launchArguments = ["-VenioBackend", "live", "-VenioAPIBaseURL", env["VENIO_E2E_BASE_URL"] ?? "http://127.0.0.1:5099", "-VenioLocale", "fr"]
        addUIInterruptionMonitor(withDescription: "Autorisations") { alert in
            for label in ["Autoriser", "Allow"] where alert.buttons[label].exists { alert.buttons[label].tap(); return true }
            return false
        }
    }

    func test1_loginSyncAndOnlineNote() throws {
        let password = try XCTUnwrap(ProcessInfo.processInfo.environment["VENIO_E2E_PASSWORD"], "VENIO_E2E_PASSWORD manquant")
        app.launch()
        let email = app.textFields["E-mail"]
        XCTAssertTrue(email.waitForExistence(timeout: 15))
        email.tap(); email.typeText(ProcessInfo.processInfo.environment["VENIO_E2E_EMAIL"] ?? "lea@venio.test")
        let secure = app.secureTextFields["Mot de passe"]
        secure.tap(); secure.typeText(password)
        app.buttons["Se connecter"].tap()
        app.tap()
        XCTAssertTrue(app.staticTexts["Maison Calder"].waitForExistence(timeout: 30), "synchro initiale")
        addNote("Note E2E en ligne")
        XCTAssertTrue(app.staticTexts["Note E2E en ligne"].waitForExistence(timeout: 15))
    }

    func test2_offlineNoteIsQueued() {
        app.launch()
        XCTAssertTrue(app.staticTexts["Maison Calder"].waitForExistence(timeout: 30), "session restaurée depuis le Keychain")
        addNote("Note E2E hors ligne")
        XCTAssertTrue(app.staticTexts["Note E2E hors ligne"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS[c] 'attente'")).firstMatch.waitForExistence(timeout: 15),
                      "la note est marquée en attente")
    }

    func test3_queueDrainsWhenBackOnline() {
        app.launch()
        XCTAssertTrue(app.staticTexts["Maison Calder"].waitForExistence(timeout: 30))
        openCalder()
        XCTAssertTrue(reveal(app.staticTexts["Note E2E hors ligne"]).waitForExistence(timeout: 15))
        let pending = app.staticTexts.containing(NSPredicate(format: "label CONTAINS[c] 'attente'")).firstMatch
        let drained = NSPredicate(format: "exists == false")
        expectation(for: drained, evaluatedWith: pending)
        waitForExpectations(timeout: 60)
    }

    func test4_offlineLeadIsQueued() {
        app.launch()
        XCTAssertTrue(app.staticTexts["Maison Calder"].waitForExistence(timeout: 30))
        app.buttons["quickEntry.open"].firstMatch.tap()
        let manual = app.buttons["newLead.manualTab"].firstMatch
        if manual.waitForExistence(timeout: 5) { manual.tap() }
        let company = app.textFields["newLead.company"]
        XCTAssertTrue(company.waitForExistence(timeout: 10))
        company.tap(); company.typeText("Lead E2E hors ligne")
        let contact = app.textFields["newLead.contact"]
        contact.tap(); contact.typeText("Camille Test")
        app.buttons["newLead.create"].tap()
        app.tabBars.buttons["Pipeline"].firstMatch.tap()
        XCTAssertTrue(reveal(app.staticTexts["Lead E2E hors ligne"]).waitForExistence(timeout: 15), "lead local visible avant la synchro")
    }

    func test5_offlineLeadIsCreatedWhenBackOnline() {
        app.launch()
        XCTAssertTrue(app.staticTexts["Maison Calder"].waitForExistence(timeout: 30))
        // L'indicateur de file (accessoire de la barre d'onglets) disparaît quand la file est vide.
        let pending = app.descendants(matching: .any).containing(NSPredicate(format: "label CONTAINS[c] 'en attente'")).firstMatch
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: pending)
        waitForExpectations(timeout: 60)
        app.tabBars.buttons["Pipeline"].firstMatch.tap()
        XCTAssertTrue(reveal(app.staticTexts["Lead E2E hors ligne"]).waitForExistence(timeout: 15))
    }

    func test6_followUpStageLostAndQuoteJourney() {
        app.launch()
        XCTAssertTrue(app.staticTexts["Maison Calder"].waitForExistence(timeout: 30))
        openCalder()
        reveal(app.buttons["lead.followUp"]).tap()
        let tomorrow = app.buttons["Demain 9 h"]
        XCTAssertTrue(tomorrow.waitForExistence(timeout: 10))
        tomorrow.tap()
        snap("1-relance")
        app.buttons["followUp.save"].tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH 'Relance du'")).firstMatch.waitForExistence(timeout: 15),
                      "la relance du jour devient une relance datée")
        reveal(app.buttons["lead.stage"]).tap()
        let demo = app.buttons["stage.option.DEMO"]
        XCTAssertTrue(demo.waitForExistence(timeout: 10))
        demo.tap()
        app.buttons["stage.save"].tap()
        XCTAssertTrue(app.buttons["stage.save"].waitForNonExistence(timeout: 15))

        app.tabBars.buttons["Pipeline"].firstMatch.tap()
        let nova = reveal(app.staticTexts["Atelier Nova"])
        XCTAssertTrue(nova.waitForExistence(timeout: 15))
        nova.tap()
        reveal(app.buttons["lead.stage"]).tap()
        let lost = app.buttons["stage.option.LOST"]
        XCTAssertTrue(lost.waitForExistence(timeout: 10))
        lost.tap()
        snap("2-etape-perdu")
        let reason = app.buttons["stage.lostReason"]
        XCTAssertTrue(reason.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["stage.save"].isEnabled, "Perdu exige un motif")
        reason.tap()
        app.buttons["Prix"].firstMatch.tap()
        app.buttons["stage.save"].tap()
        XCTAssertTrue(app.buttons["stage.save"].waitForNonExistence(timeout: 15))
    }

    func test7_quoteOnLeadIsAttachedAndSent() {
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Pipeline"].firstMatch.waitForExistence(timeout: 30), "session restaurée")
        app.tabBars.buttons["Pipeline"].firstMatch.tap()
        let calder = reveal(app.staticTexts["Maison Calder"])
        XCTAssertTrue(calder.waitForExistence(timeout: 15))
        calder.tap()
        reveal(app.scrollViews.buttons["Devis"].firstMatch).tap()
        let draft = app.buttons["Créer le brouillon"]
        XCTAssertTrue(draft.waitForExistence(timeout: 10))
        draft.tap()
        XCTAssertTrue(draft.waitForNonExistence(timeout: 20))
        app.tabBars.buttons["Devis"].firstMatch.tap()
        let quote = app.buttons.containing(NSPredicate(format: "label CONTAINS 'DV-'")).firstMatch
        XCTAssertTrue(quote.waitForExistence(timeout: 15))
        quote.tap()
        let attach = app.buttons["Rattacher à un projet"]
        XCTAssertTrue(attach.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["Envoyer"].isEnabled, "l’envoi attend le rattachement")
        attach.tap()
        let project = app.buttons.containing(NSPredicate(format: "label CONTAINS 'Plateforme de réservation'")).firstMatch
        XCTAssertTrue(project.waitForExistence(timeout: 10))
        project.tap()
        XCTAssertTrue(attach.waitForNonExistence(timeout: 15))
        let send = app.buttons["Envoyer"]
        XCTAssertTrue(send.waitForExistence(timeout: 10))
        XCTAssertTrue(send.isEnabled)
        send.tap()
        XCTAssertTrue(send.waitForNonExistence(timeout: 15), "le devis est envoyé")
        snap("3-devis-envoye")
    }

    /// Le script envoie `xcrun simctl push` (catégorie VENIO_QUOTE) pendant que ce test attend la bannière.
    func test8_quotePushOpensQuote() {
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Pipeline"].firstMatch.waitForExistence(timeout: 30), "session restaurée")
        XCUIDevice.shared.press(.home)
        let banner = XCUIApplication(bundleIdentifier: "com.apple.springboard").descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS 'Devis consulté'")).firstMatch
        XCTAssertTrue(banner.waitForExistence(timeout: 60), "bannière de la notification de devis")
        banner.tap()
        XCTAssertTrue(app.staticTexts["Mis à jour le"].waitForExistence(timeout: 20), "la notification ouvre le devis")
        snap("4-push-ouvre-devis")
    }

    /// Captures facultatives : `TEST_RUNNER_VENIO_E2E_SHOTS=<dossier>` les écrit en PNG.
    private func snap(_ name: String) {
        guard let dir = ProcessInfo.processInfo.environment["VENIO_E2E_SHOTS"] else { return }
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent(name + ".png"))
    }

    private func openCalder() {
        app.tabBars.buttons["Aujourd’hui"].firstMatch.tap()
        let row = app.buttons.containing(NSPredicate(format: "label CONTAINS 'Maison Calder'")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 15))
        row.tap()
    }

    /// Les écrans sont des piles paresseuses, et le bas de l'écran est couvert par la barre d'onglets
    /// et l'accessoire Saisie rapide : on fait défiler jusqu'à ce que l'élément soit dans la moitié haute.
    private func reveal(_ element: XCUIElement) -> XCUIElement {
        let limit = app.frame.height * 0.6
        for _ in 0..<10 where !element.exists || element.frame.maxY > limit { app.swipeUp(velocity: .slow) }
        return element
    }

    private func addNote(_ text: String) {
        openCalder()
        let action = reveal(app.buttons["lead.voiceNote"])
        XCTAssertTrue(action.waitForExistence(timeout: 10))
        action.tap()
        let editor = app.textViews["voiceNote.text"]
        XCTAssertTrue(editor.waitForExistence(timeout: 10))
        editor.tap(); editor.typeText(text)
        app.buttons["voiceNote.save"].tap()
        _ = reveal(app.staticTexts[text])
    }
}
