import SwiftUI

extension RGBColor {
    public var color: Color { Color(.sRGB, red: red, green: green, blue: blue, opacity: 1) }
}

private struct VenioPaletteKey: EnvironmentKey {
    static let defaultValue = ThemePalette(.default)
}

extension EnvironmentValues {
    public var venioPalette: ThemePalette {
        get { self[VenioPaletteKey.self] }
        set { self[VenioPaletteKey.self] = newValue }
    }
}

public struct ThemedBackground: View {
    @Environment(\.venioPalette) private var palette

    public init() {}

    public var body: some View {
        GeometryReader { geometry in
            ZStack {
                palette.base.color
                if palette.theme == .glass {
                    LinearGradient(colors: [palette.base.color, palette.halos[0].color.opacity(0.25), palette.base.color], startPoint: .topLeading, endPoint: .bottomTrailing)
                    Circle()
                        .fill(palette.halos[0].color.opacity(0.45))
                        .frame(width: geometry.size.width * 0.9)
                        .blur(radius: 80)
                        .offset(x: -geometry.size.width * 0.35, y: -geometry.size.height * 0.3)
                    Circle()
                        .fill(palette.halos[1].color.opacity(0.35))
                        .frame(width: geometry.size.width * 0.8)
                        .blur(radius: 90)
                        .offset(x: geometry.size.width * 0.35, y: geometry.size.height * 0.3)
                }
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

private struct VenioCard: ViewModifier {
    @Environment(\.venioPalette) private var palette

    func body(content: Content) -> some View {
        if palette.theme == .glass {
            GlassEffectContainer {
                content.padding().glassEffect(.regular, in: RoundedRectangle(cornerRadius: 22))
            }
        } else {
            content.padding()
                .background(palette.surfaces[0].color, in: RoundedRectangle(cornerRadius: 22))
                .overlay {
                    RoundedRectangle(cornerRadius: 22).strokeBorder(palette.accent.color.opacity(0.25), lineWidth: 0.5)
                }
                .shadow(color: palette.accent.color.opacity(0.12), radius: 12)
        }
    }
}

private struct VenioPrimaryButton: ButtonStyle {
    @Environment(\.venioPalette) private var palette

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .foregroundStyle(palette.onAccent.color)
            .background(palette.accent.color, in: Capsule())
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

extension View {
    public func venioCard() -> some View { modifier(VenioCard()) }
    public func venioPrimaryButton() -> some View { buttonStyle(VenioPrimaryButton()) }
}

public struct ThemeHost<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    private let manager: ThemeManager
    private let content: Content

    public init(manager: ThemeManager, @ViewBuilder content: () -> Content) {
        self.manager = manager
        self.content = content()
    }

    private var palette: ThemePalette {
        #if os(watchOS)
        ThemePalette.watch(manager.selection)
        #else
        manager.palette
        #endif
    }
    private var preferredScheme: ColorScheme? {
        #if os(watchOS)
        return .dark
        #else
        guard let isDark = manager.preferredIsDark else { return nil }
        return isDark ? .dark : .light
        #endif
    }

    public var body: some View {
        content
            .environment(manager)
            .environment(\.locale, manager.locale)
            .environment(\.venioPalette, palette)
            .foregroundStyle(palette.textPrimary.color)
            .tint(palette.accentText.color)
            .preferredColorScheme(preferredScheme)
            .onChange(of: colorScheme, initial: true) { _, scheme in
                manager.proposeDarkAppearance(scheme == .dark)
            }
    }
}
