// swift-tools-version: 5.9

// Swift-Playgrounds-/Xcode-App-Paket.
// Öffnen: Doppelklick auf "Finanzverwaltung.swiftpm" (Xcode 15+ auf dem Mac
// oder Swift Playgrounds 4.4+ direkt auf dem iPad).

import PackageDescription
import AppleProductTypes

let package = Package(
    name: "Finanzverwaltung",
    platforms: [
        .iOS("17.0")
    ],
    products: [
        .iOSApplication(
            name: "Finanzverwaltung",
            targets: ["AppModule"],
            bundleIdentifier: "de.ponturo.financeapp",
            teamIdentifier: "",
            displayVersion: "1.0",
            bundleVersion: "1",
            appIcon: .asset("AppIcon"),
            accentColor: .presetColor(.blue),
            supportedDeviceFamilies: [
                .pad,
                .phone
            ],
            supportedInterfaceOrientations: [
                .portrait,
                .landscapeRight,
                .landscapeLeft,
                .portraitUpsideDown(.when(deviceFamilies: [.pad]))
            ],
            capabilities: [
                .faceID(purposeString: "Face ID wird verwendet, um die Finanzverwaltung zu entsperren.")
            ],
            appCategory: .finance
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: "Sources",
            resources: [
                .process("Resources")
            ]
        )
    ]
)
