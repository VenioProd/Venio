import XCTest

/// Lancement en mode live sans serveur : l'app doit rester vivante et afficher l'écran de connexion
/// (ou l'espace commercial si une session est restaurée), jamais planter.
@MainActor final class LaunchTests: XCTestCase {
    func testLiveLaunchShowsLoginOrSpace() {
        let app = XCUIApplication()
        app.launchArguments = ["-VenioBackend", "live", "-VenioAPIBaseURL", "http://127.0.0.1:5099", "-VenioLocale", "fr"]
        app.launch()
        let login = app.textFields["E-mail"]
        let space = app.tabBars.buttons["Pipeline"].firstMatch
        let shown = login.waitForExistence(timeout: 15) || space.exists
        XCTAssertTrue(shown, "écran de connexion ou espace commercial")
        sleep(5)
        XCTAssertEqual(app.state, .runningForeground, "l'app ne doit pas planter après le lancement")
    }
}
