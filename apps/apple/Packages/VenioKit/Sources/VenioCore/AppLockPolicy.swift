import Foundation

public enum AppLockPolicy {
    public static func requiresLock(enabled: Bool, firstDisplay: Bool, backgroundedAt: Date?, now: Date) -> Bool {
        guard enabled else { return false }
        if firstDisplay { return true }
        guard let backgroundedAt else { return false }
        return now.timeIntervalSince(backgroundedAt) > 5 * 60
    }
}
