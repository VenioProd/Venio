import XCTest

/// Poste d'appel (lot N) contre un backend local et un faux opérateur Twilio (voir README) :
/// l'app transmet le jeton et l'identifiant d'appel au faux opérateur, qui joue les rappels signés
/// vers le serveur. Le simulateur n'a pas d'interface d'appel : CallKit y est remplacé par le moteur direct.
@MainActor final class CallDeskJourneyTests: XCTestCase {
    private var app: XCUIApplication!
    private let env = ProcessInfo.processInfo.environment
    private var operatorURL: String { env["VENIO_E2E_OPERATOR"] ?? "http://127.0.0.1:5098" }

    override func setUp() async throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-VenioBackend", "live", "-VenioAPIBaseURL", env["VENIO_E2E_BASE_URL"] ?? "http://127.0.0.1:5099",
                               "-VenioLocale", "fr", "-VenioVoice", "simulated", "-VenioVoiceOperator", operatorURL]
        addUIInterruptionMonitor(withDescription: "Autorisations") { alert in
            for label in ["Autoriser", "Allow", "Refuser"] where alert.buttons[label].exists { alert.buttons[label].tap(); return true }
            return false
        }
    }

    func test1_queueCallObjectionAndOutcome() throws {
        try launchSignedIn()
        openQueue()
        shot("01-file-d-appels")
        app.buttons["Appeler Atelier Alpha"].tap()
        XCTAssertTrue(app.staticTexts["En communication"].waitForExistence(timeout: 20))
        shot("02-en-communication")
        app.buttons["call.stopRecording"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["call.recordingStopped"].waitForExistence(timeout: 10), "arrêt confirmé par le serveur")
        shot("03-opposition-confirmee")
        app.buttons["call.hangup"].tap()
        let save = app.buttons["afterCall.save"]
        XCTAssertTrue(save.waitForExistence(timeout: 20))
        shot("04-resultat-a-saisir")
        app.buttons["outcome.MEETING_BOOKED"].tap()
        let note = app.descendants(matching: .any)["afterCall.note"]
        note.tap(); note.typeText("RDV jeudi pour la refonte")
        save.tap()
        XCTAssertTrue(app.staticTexts["Pas de transcript : le prospect a refusé l’enregistrement"].waitForExistence(timeout: 20))
        shot("05-resultat-enregistre-sans-transcript")
        app.buttons["afterCall.done"].tap()
    }

    func test2_noAnswerPreselectsTheOutcome() async throws {
        try await setAnswers(false)
        try launchSignedIn()
        openQueue()
        app.buttons["Appeler Boulangerie Beta"].tap()
        let save = app.buttons["afterCall.save"]
        XCTAssertTrue(save.waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["outcome.NO_ANSWER"].isSelected, "résultat présélectionné par suggestedOutcome")
        XCTAssertTrue(app.staticTexts["Présélectionné d’après l’état de l’appel."].exists)
        shot("06-sans-reponse-preselectionne")
        save.tap()
        XCTAssertTrue(app.buttons["afterCall.done"].waitForExistence(timeout: 15))
        app.buttons["afterCall.done"].tap()
        try await setAnswers(true)
    }

    func test3_callFromLeadThenTranscriptAndAnalysis() throws {
        try launchSignedIn()
        openQueue()
        app.staticTexts["Cabinet Gamma"].tap()
        let call = reveal(app.buttons["lead.call"])
        XCTAssertTrue(call.waitForExistence(timeout: 15))
        call.tap()
        XCTAssertTrue(app.staticTexts["En communication"].waitForExistence(timeout: 20))
        sleep(3)
        app.buttons["call.hangup"].tap()
        XCTAssertTrue(app.buttons["afterCall.save"].waitForExistence(timeout: 20))
        app.buttons["outcome.CALLBACK"].tap()
        shot("07-a-rappeler-date-exigee")
        app.buttons["afterCall.save"].tap()
        XCTAssertTrue(app.staticTexts["Transcript en cours"].waitForExistence(timeout: 20))
        shot("08-transcript-en-cours")
        XCTAssertTrue(app.staticTexts["Analyse à valider"].waitForExistence(timeout: 90))
        XCTAssertTrue(app.buttons["afterCall.openWeb"].exists)
        shot("09-analyse-a-valider")
        app.buttons["afterCall.done"].tap()
        XCTAssertTrue(reveal(app.staticTexts["Appels"]).waitForExistence(timeout: 15))
        shot("10-fiche-appels")
    }

    /// Serveur relancé sans variables Twilio : pas de bouton d'appel dans la file, la fiche garde le lien `tel:`.
    func test4_disabledTelephonyKeepsTheTelLink() throws {
        try launchSignedIn()
        openQueue()
        XCTAssertTrue(app.staticTexts["Atelier Alpha"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["Appeler Atelier Alpha"].exists)
        shot("11-telephonie-desactivee-file")
        app.staticTexts["Atelier Alpha"].tap()
        XCTAssertTrue(reveal(app.buttons["lead.call"]).waitForExistence(timeout: 15))
        shot("12-telephonie-desactivee-fiche")
    }

    private func launchSignedIn() throws {
        app.launch()
        let email = app.textFields["E-mail"]
        if email.waitForExistence(timeout: 8) {
            let password = try XCTUnwrap(env["VENIO_E2E_PASSWORD"], "VENIO_E2E_PASSWORD manquant")
            email.tap(); email.typeText(env["VENIO_E2E_EMAIL"] ?? "lea@venio.test")
            let secure = app.secureTextFields["Mot de passe"]
            secure.tap(); secure.typeText(password)
            app.buttons["Se connecter"].tap()
        }
        app.tap()
    }

    private func openQueue() {
        let queue = app.buttons["today.callQueue"].firstMatch
        XCTAssertTrue(queue.waitForExistence(timeout: 30))
        queue.tap()
        XCTAssertTrue(app.staticTexts["Atelier Alpha"].waitForExistence(timeout: 15))
    }

    private func setAnswers(_ value: Bool) async throws {
        var request = URLRequest(url: URL(string: operatorURL + "/mode")!)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(["answer": value])
        _ = try await URLSession.shared.data(for: request)
    }

    private func reveal(_ element: XCUIElement) -> XCUIElement {
        let limit = app.frame.height * 0.6
        for _ in 0..<10 where !element.exists || element.frame.maxY > limit { app.swipeUp(velocity: .slow) }
        return element
    }

    /// Captures facultatives : `TEST_RUNNER_VENIO_E2E_SHOTS=<dossier>` les écrit en PNG.
    private func shot(_ name: String) {
        guard let dir = env["VENIO_E2E_SHOTS"] else { return }
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent(name + ".png"))
    }
}
