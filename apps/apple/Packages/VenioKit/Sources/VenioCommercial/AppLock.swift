#if !os(watchOS)
import SwiftUI
import Observation
import LocalAuthentication
import VenioCore
import VenioTheme
#if os(iOS)
import UIKit
#else
import AppKit
#endif

@Observable @MainActor public final class AppLock {
    public static let shared = AppLock()
    public private(set) var enabled: Bool
    public private(set) var isLocked: Bool
    public private(set) var isActive = false
    private(set) var authenticating = false
    private(set) var failed = false
    private var backgroundedAt: Date?
    private var automaticallyAttempted = false
    public var requiresAuthentication: Bool {
        isLocked || AppLockPolicy.requiresLock(enabled: enabled, firstDisplay: false, backgroundedAt: backgroundedAt, now: .now)
    }
    public var blocksAccess: Bool { requiresAuthentication || (enabled && !isActive) }

    private init() {
        let stored = UserDefaults.standard.bool(forKey: "venio.lock.enabled")
        enabled = stored
        isLocked = AppLockPolicy.requiresLock(enabled: stored, firstDisplay: true, backgroundedAt: nil, now: .now)
    }

    func availability() -> (available: Bool, label: String) {
        let context = LAContext()
        let available = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
        let label = switch context.biometryType {
        case .faceID: "Face ID"
        case .touchID: "Touch ID"
        default: "code de l’appareil"
        }
        return (available, label)
    }

    func setEnabled(_ value: Bool, locale: Locale) async {
        guard !authenticating else { return }
        if value {
            guard await authenticate(locale: locale) else { return }
        }
        enabled = value
        UserDefaults.standard.set(value, forKey: "venio.lock.enabled")
        if !value { isLocked = false }
    }

    func phaseChanged(_ phase: ScenePhase) {
        if phase == .background, backgroundedAt == nil { backgroundedAt = .now }
        if phase == .active {
            if AppLockPolicy.requiresLock(enabled: enabled, firstDisplay: false, backgroundedAt: backgroundedAt, now: .now) {
                isLocked = true
                automaticallyAttempted = false
            }
            backgroundedAt = nil
        }
        isActive = phase == .active
    }

    func proposeUnlock(locale: Locale) async {
        guard !automaticallyAttempted else { return }
        await unlock(locale: locale)
    }

    func unlock(locale: Locale) async {
        guard isLocked, isActive, !authenticating else { return }
        automaticallyAttempted = true
        if await authenticate(locale: locale) { isLocked = false }
    }

    private func authenticate(locale: Locale) async -> Bool {
        authenticating = true
        failed = false
        defer { authenticating = false }
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { failed = true; return false }
        do {
            let success = try await context.evaluatePolicy(.deviceOwnerAuthentication,
                localizedReason: CommercialStrings.text("Déverrouiller Venio pour accéder à vos données", locale: locale))
            failed = !success
            return success
        } catch { failed = true; return false }
    }
}

struct AppLockSetting: View {
    @Environment(\.locale) private var locale
    @State private var lock = AppLock.shared
    var body: some View {
        let availability = lock.availability()
        Section {
            Toggle(isOn: Binding(get: { lock.enabled }, set: { value in Task { await lock.setEnabled(value, locale: locale) } })) {
                VStack(alignment: .leading, spacing: 4) {
                    VText("Verrouiller Venio")
                    VText(availability.label).font(.caption)
                }
            }.disabled(!availability.available || lock.authenticating)
            if !availability.available { VText("Configurez la biométrie ou un code de l’appareil pour activer le verrouillage.").font(.caption) }
            if lock.failed { VText("Authentification annulée ou impossible. Réessayez.").font(.caption) }
        }
    }
}

private struct AppLockCover: View {
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    let lock: AppLock
    var body: some View {
        ZStack {
            palette.base.color.ignoresSafeArea()
            VStack(spacing: 22) {
                Image(systemName: "lock.fill").font(.largeTitle).foregroundStyle(palette.accent.color)
                Text(verbatim: "Venio").font(.largeTitle.bold())
                if lock.isLocked, lock.isActive {
                    Button { Task { await lock.unlock(locale: locale) } } label: { VText("Déverrouiller") }
                        .venioPrimaryButton().disabled(lock.authenticating)
                    if lock.failed { VText("Authentification annulée ou impossible. Réessayez.").multilineTextAlignment(.center) }
                }
            }.padding(32).foregroundStyle(palette.textPrimary.color)
        }
        .task(id: lock.isLocked && lock.isActive) {
            if lock.isLocked && lock.isActive { await lock.proposeUnlock(locale: locale) }
        }
    }
}

private struct AppLockModifier: ViewModifier {
    @Environment(\.scenePhase) private var phase
    @Environment(\.locale) private var locale
    @Environment(\.venioPalette) private var palette
    let lock: AppLock
    func body(content: Content) -> some View {
        content
            .disabled(lock.blocksAccess)
            .allowsHitTesting(!lock.blocksAccess)
            .accessibilityHidden(lock.blocksAccess)
            .background {
                LockWindow(visible: lock.blocksAccess, interactive: lock.isActive && lock.isLocked,
                    cover: AnyView(AppLockCover(lock: lock).environment(\.locale, locale).environment(\.venioPalette, palette)))
            }
            .onChange(of: phase, initial: true) { _, phase in lock.phaseChanged(phase) }
    }
}

public extension View {
    func venioAppLock(_ lock: AppLock) -> some View { modifier(AppLockModifier(lock: lock)) }
}

// Une fenêtre dédiée couvre aussi les compositeurs et les feuilles déjà présentés.
#if os(iOS)
private struct LockWindow: UIViewRepresentable {
    let visible: Bool
    let interactive: Bool
    let cover: AnyView
    func makeUIView(context: Context) -> Anchor { Anchor() }
    func updateUIView(_ view: Anchor, context: Context) { view.visible = visible; view.interactive = interactive; view.cover = cover; view.updateCover() }
    static func dismantleUIView(_ view: Anchor, coordinator: ()) { view.hide() }
    final class Anchor: UIView {
        var visible = false
        var interactive = false
        var cover = AnyView(EmptyView())
        var shield: UIWindow?
        weak var previousKeyWindow: UIWindow?
        func hide() {
            let wasKey = shield?.isKeyWindow == true
            shield?.isHidden = true
            if wasKey { previousKeyWindow?.makeKey() }
        }
        override func didMoveToWindow() { super.didMoveToWindow(); updateCover() }
        override func layoutSubviews() { super.layoutSubviews(); updateCover() }
        func updateCover() {
            guard visible, let scene = window?.windowScene else { hide(); return }
            if shield == nil {
                let shield = UIWindow(windowScene: scene)
                shield.windowLevel = .alert + 1
                shield.accessibilityViewIsModal = true
                shield.rootViewController = UIHostingController(rootView: cover)
                self.shield = shield
            }
            (shield?.rootViewController as? UIHostingController<AnyView>)?.rootView = cover
            shield?.frame = scene.coordinateSpace.bounds
            shield?.isHidden = false
            if interactive, shield?.isKeyWindow != true {
                previousKeyWindow = scene.windows.first(where: \.isKeyWindow)
                shield?.makeKey()
            }
        }
    }
}
#else
private struct LockWindow: NSViewRepresentable {
    let visible: Bool
    let interactive: Bool
    let cover: AnyView
    func makeNSView(context: Context) -> Anchor { Anchor() }
    func updateNSView(_ view: Anchor, context: Context) { view.visible = visible; view.interactive = interactive; view.cover = cover; view.updateCover() }
    static func dismantleNSView(_ view: Anchor, coordinator: ()) { view.hide() }
    final class Anchor: NSView {
        var visible = false
        var interactive = false
        var cover = AnyView(EmptyView())
        var shield: NSPanel?
        weak var previousKeyWindow: NSWindow?
        override func viewDidMoveToWindow() { super.viewDidMoveToWindow(); updateCover() }
        override func layout() { super.layout(); updateCover() }
        func hide() {
            if let shield {
                let wasKey = shield.isKeyWindow
                shield.parent?.removeChildWindow(shield)
                shield.orderOut(nil)
                if wasKey { previousKeyWindow?.makeKey() }
            }
            shield = nil
        }
        func updateCover() {
            guard visible, let window else { hide(); return }
            if shield == nil {
                let panel = ShieldPanel(contentRect: window.frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
                panel.isOpaque = true
                panel.hidesOnDeactivate = false
                panel.level = NSWindow.Level(rawValue: NSWindow.Level.modalPanel.rawValue + 1)
                panel.collectionBehavior = [.fullScreenAuxiliary]
                panel.contentView = NSHostingView(rootView: cover)
                window.addChildWindow(panel, ordered: .above)
                shield = panel
            }
            (shield?.contentView as? NSHostingView<AnyView>)?.rootView = cover
            shield?.setFrame(window.frame, display: true)
            shield?.orderFront(nil)
            if interactive, shield?.isKeyWindow != true {
                previousKeyWindow = NSApp.keyWindow
                shield?.makeKey()
            }
        }
    }
    final class ShieldPanel: NSPanel {
        override var canBecomeKey: Bool { true }
    }
}
#endif
#endif
