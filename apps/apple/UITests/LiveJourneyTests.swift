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
