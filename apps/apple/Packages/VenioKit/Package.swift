// swift-tools-version: 6.4
import PackageDescription

let package = Package(
    name: "VenioKit",
    defaultLocalization: "fr",
    platforms: [.iOS("27.0"), .macOS("27.0"), .watchOS("27.0")],
    products: [
        .library(name: "VenioCore", targets: ["VenioCore"]),
        .library(name: "VenioTheme", targets: ["VenioTheme"]),
        .library(name: "VenioCommercial", targets: ["VenioCommercial"])
    ],
    targets: [
        .target(name: "VenioCore"),
        .target(name: "VenioTheme"),
        .target(name: "VenioCommercial", dependencies: ["VenioCore", "VenioTheme"], resources: [.process("Resources")]),
        .testTarget(name: "VenioCoreTests", dependencies: ["VenioCore"]),
        .testTarget(name: "VenioThemeTests", dependencies: ["VenioTheme"])
    ],
    swiftLanguageModes: [.v6]
)
