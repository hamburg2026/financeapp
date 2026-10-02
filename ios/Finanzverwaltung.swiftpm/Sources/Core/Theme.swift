import SwiftUI

/// Farbthemen der Web-App (`THEMES`).
struct AppTheme: Identifiable, Hashable {
    let id: String
    let label: String
    let primary: Color
    let dark: Color
    let light: Color
    let background: Color

    static let all: [AppTheme] = [
        AppTheme(id: "blue", label: "Dunkelblau", primary: Color(hex: 0x1e3a5f), dark: Color(hex: 0x152b47), light: Color(hex: 0x60a5fa), background: Color(hex: 0xeff6ff)),
        AppTheme(id: "green", label: "Grün", primary: Color(hex: 0x1a6b3c), dark: Color(hex: 0x145530), light: Color(hex: 0x4ade80), background: Color(hex: 0xf0fdf4)),
        AppTheme(id: "teal", label: "Petrol", primary: Color(hex: 0x0f766e), dark: Color(hex: 0x0c5c55), light: Color(hex: 0x2dd4bf), background: Color(hex: 0xf0fdfa)),
        AppTheme(id: "purple", label: "Lila", primary: Color(hex: 0x5b21b6), dark: Color(hex: 0x4c1d95), light: Color(hex: 0xa78bfa), background: Color(hex: 0xf5f3ff)),
        AppTheme(id: "slate", label: "Anthrazit", primary: Color(hex: 0x334155), dark: Color(hex: 0x1e293b), light: Color(hex: 0x94a3b8), background: Color(hex: 0xf8fafc)),
        AppTheme(id: "rose", label: "Bordeaux", primary: Color(hex: 0x9f1239), dark: Color(hex: 0x881337), light: Color(hex: 0xfb7185), background: Color(hex: 0xfff1f2)),
    ]

    static func named(_ id: String) -> AppTheme { all.first { $0.id == id } ?? all[0] }

    static let storageKey = "theme_color"
}

extension Color {
    /// Color(hex: 0x1e3a5f)
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xff) / 255,
                  green: Double((hex >> 8) & 0xff) / 255,
                  blue: Double(hex & 0xff) / 255,
                  opacity: opacity)
    }

    /// Color(hexString: "#16a34a")
    init(hexString: String) {
        let s = hexString.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        self.init(hex: UInt32(s, radix: 16) ?? 0x6b7280)
    }

    // Feste Signalfarben der Web-App
    static let income = Color(hex: 0x16a34a)      // grün
    static let expense = Color(hex: 0xdc2626)     // rot
    static let positiveBlue = Color(hex: 0x2563eb)
    static let negativeRose = Color(hex: 0x9f1239)
    static let mutedText = Color(hex: 0x6b7280)
    static let borderGray = Color(hex: 0xe5e7eb)
    static let warning = Color(hex: 0xd97706)

    /// Grün für ≥ 0, Rot für < 0
    static func signed(_ value: Double) -> Color { value >= 0 ? .income : .expense }
}

/// Farbpalette für Diagramme und Personen (wie in der Web-App).
enum Palette {
    private static let chartHex: [UInt32] = [
        0x2563eb, 0x16a34a, 0xd97706, 0xdc2626, 0x7c3aed, 0x0891b2,
        0xdb2777, 0x65a30d, 0xea580c, 0x4f46e5, 0x0d9488, 0xca8a04,
    ]
    static let chart: [Color] = chartHex.map { Color(hex: $0) }

    static func color(_ index: Int) -> Color { chart[((index % chart.count) + chart.count) % chart.count] }

    /// Personenfarben (Rand, Badge-Hintergrund, Badge-Text)
    static let persons: [(border: Color, badgeBg: Color, badgeText: Color)] = [
        (Color(hex: 0xf43f5e), Color(hex: 0xffe4e6), Color(hex: 0xbe123c)),
        (Color(hex: 0x3b82f6), Color(hex: 0xdbeafe), Color(hex: 0x1d4ed8)),
        (Color(hex: 0x16a34a), Color(hex: 0xdcfce7), Color(hex: 0x15803d)),
        (Color(hex: 0xd97706), Color(hex: 0xfef3c7), Color(hex: 0xb45309)),
        (Color(hex: 0x7c3aed), Color(hex: 0xede9fe), Color(hex: 0x6d28d9)),
        (Color(hex: 0x0891b2), Color(hex: 0xcffafe), Color(hex: 0x0369a1)),
    ]
}

// MARK: - Umgebung

private struct AppThemeKey: EnvironmentKey {
    static let defaultValue = AppTheme.all[0]
}

extension EnvironmentValues {
    /// Aktuelles Farbthema (Primärfarbe etc.).
    var appTheme: AppTheme {
        get { self[AppThemeKey.self] }
        set { self[AppThemeKey.self] = newValue }
    }
}
