import Foundation
import Testing
@testable import VenioCore

@Test func appLockPolicy() {
    let start = Date(timeIntervalSince1970: 1_000)
    #expect(AppLockPolicy.requiresLock(enabled: true, firstDisplay: true, backgroundedAt: nil, now: start))
    #expect(!AppLockPolicy.requiresLock(enabled: false, firstDisplay: true, backgroundedAt: nil, now: start))
    #expect(!AppLockPolicy.requiresLock(enabled: true, firstDisplay: false, backgroundedAt: nil, now: start))
    #expect(!AppLockPolicy.requiresLock(enabled: true, firstDisplay: false, backgroundedAt: start, now: start.addingTimeInterval(299)))
    #expect(!AppLockPolicy.requiresLock(enabled: true, firstDisplay: false, backgroundedAt: start, now: start.addingTimeInterval(300)))
    #expect(AppLockPolicy.requiresLock(enabled: true, firstDisplay: false, backgroundedAt: start, now: start.addingTimeInterval(301)))
    #expect(!AppLockPolicy.requiresLock(enabled: false, firstDisplay: false, backgroundedAt: start, now: start.addingTimeInterval(301)))
}
