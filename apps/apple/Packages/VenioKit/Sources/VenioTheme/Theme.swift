import Foundation

public enum ThemeKind: String, Codable, Sendable, CaseIterable {
    case glass, neon

    public var backgrounds: [String] {
        switch self {
        case .glass: ["mist", "dawn", "lagoon", "lavender", "night"]
        case .neon: ["black", "graphite", "abyss", "plum", "forest"]
        }
    }

    public var accents: [String] {
        switch self {
        case .glass: ["sky", "violet", "mint", "coral", "amber"]
        case .neon: ["cyan", "magenta", "violet", "acid", "orange"]
        }
    }
}

public struct ThemeSelection: Codable, Sendable, Equatable {
    public let theme: ThemeKind
    public let background: String
    public let accent: String
    public let locale: String
    public let autoTranslate: Bool

    public static let `default` = Self(theme: .glass, background: "mist", accent: "sky")

    public init(theme: ThemeKind, background: String, accent: String, locale: String = "system", autoTranslate: Bool = true) {
        self.locale = ["system", "fr", "en"].contains(locale) ? locale : "system"
        self.autoTranslate = autoTranslate
        self.theme = theme
        let valid = theme.backgrounds.contains(background) && theme.accents.contains(accent)
        self.background = valid ? background : theme.backgrounds[0]
        self.accent = valid ? accent : theme.accents[0]
    }

    private enum CodingKeys: String, CodingKey { case theme, background, accent, locale, autoTranslate }

    public init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        self.init(theme: try values.decode(ThemeKind.self, forKey: .theme),
                  background: try values.decode(String.self, forKey: .background),
                  accent: try values.decode(String.self, forKey: .accent),
                  locale: try values.decodeIfPresent(String.self, forKey: .locale) ?? "system",
                  autoTranslate: try values.decodeIfPresent(Bool.self, forKey: .autoTranslate) ?? true)
    }
}

public struct ThemePalette: Sendable, Equatable {
    public let theme: ThemeKind
    public let base: RGBColor
    public let halos: [RGBColor]
    public let surfaces: [RGBColor]
    public let isDark: Bool
    public let accent: RGBColor
    public let onAccent: RGBColor
    public let textPrimary: RGBColor
    public let textSecondary: RGBColor
    public let accentText: RGBColor
    public let urgent: RGBColor
    public let success: RGBColor
    public let warning: RGBColor
    public let chartSecondary: RGBColor

    public static func watch(_ selection: ThemeSelection) -> ThemePalette {
        ThemePalette(ThemeSelection(theme: selection.theme,
            background: selection.theme == .glass ? "night" : selection.background,
            accent: selection.accent, locale: selection.locale, autoTranslate: selection.autoTranslate))
    }

    public init(_ selection: ThemeSelection) {
        theme = selection.theme
        let background: (UInt32, UInt32, UInt32)
        let accentHex: UInt32
        switch selection.theme {
        case .glass:
            switch selection.background {
            case "dawn": background = (0xFBF1EC, 0xFECDD3, 0xFDE68A)
            case "lagoon": background = (0xECF7F5, 0x99F6E4, 0xBAE6FD)
            case "lavender": background = (0xF3F0FA, 0xDDD6FE, 0xFBCFE8)
            case "night": background = (0x0B1220, 0x1E3A8A, 0x4C1D95)
            default: background = (0xEEF3F8, 0xBAE6FD, 0xDDD6FE)
            }
            switch selection.accent {
            case "violet": accentHex = 0x7C3AED
            case "mint": accentHex = 0x10B981
            case "coral": accentHex = 0xF97362
            case "amber": accentHex = 0xF59E0B
            default: accentHex = 0x0EA5E9
            }
            halos = [RGBColor(hex: background.1), RGBColor(hex: background.2)]
            surfaces = []
            isDark = selection.background == "night"
            urgent = RGBColor(hex: accentHex == 0xF97362 ? 0xC81E1E : 0xF97362)
            success = RGBColor(hex: 0x30D158)
            warning = RGBColor(hex: 0xD99A00)
            chartSecondary = RGBColor(hex: 0x64748B)
            textPrimary = RGBColor(hex: isDark ? 0xF4F6FF : 0x0D1424)
            textSecondary = RGBColor(hex: isDark ? 0xB4BCD6 : 0x3D4A66)
        case .neon:
            switch selection.background {
            case "graphite": background = (0x0D1117, 0x161B22, 0x1F2630)
            case "abyss": background = (0x04121F, 0x0A1D30, 0x112840)
            case "plum": background = (0x12071C, 0x1C0F2A, 0x26163A)
            case "forest": background = (0x03130E, 0x0A1F18, 0x112B22)
            default: background = (0x050505, 0x0D0F12, 0x14171C)
            }
            switch selection.accent {
            case "magenta": accentHex = 0xFF0080
            case "violet": accentHex = 0xA855F7
            case "acid": accentHex = 0x39FF88
            case "orange": accentHex = 0xFF7A1A
            default: accentHex = 0x0EA5E9
            }
            halos = []
            surfaces = [RGBColor(hex: background.1), RGBColor(hex: background.2)]
            isDark = true
            urgent = RGBColor(hex: accentHex == 0xFF0080 ? 0xFF3B3B : 0xFF0080)
            success = RGBColor(hex: 0x22C55E)
            warning = RGBColor(hex: 0xFFB020)
            chartSecondary = RGBColor(hex: 0x94A3B8)
            textPrimary = RGBColor(hex: 0xE8EEF5)
            textSecondary = RGBColor(hex: 0x98A4B3)
        }
        base = RGBColor(hex: background.0)
        accent = RGBColor(hex: accentHex)
        let white = RGBColor(hex: 0xFFFFFF)
        let ink = RGBColor(hex: 0x0B1220)
        onAccent = white.contrast(with: accent) > ink.contrast(with: accent) ? white : ink
        accentText = accent.textVariant(on: base, toward: isDark ? white : ink)
    }
}
