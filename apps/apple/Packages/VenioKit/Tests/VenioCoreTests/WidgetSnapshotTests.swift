import Foundation
import Testing
@testable import VenioCore

@Test func widgetSnapshotUsesOnlyCurrentUsersTodayAndMonthlyRevenue() async throws {
    let now = DemoClock.date(23, hour: 11)
    let clock = DemoClock(now: now)
    let api = MockVenioAPI(clock: clock)
    var leads = try await api.leads()
    var foreign = leads[0]
    foreign.id = "foreign"
    foreign.assignedTo = MockVenioAPI.hugo.id
    foreign.nextActionAt = DemoClock.date(23, hour: 12)
    leads.append(foreign)
    let quotes = try await api.quotes()
    let appointments = try await api.appointments()
    let snapshot = WidgetSnapshot.build(leads: leads, quotes: quotes, appointments: appointments,
        userID: MockVenioAPI.lea.id, monthlyTarget: 40000, now: now, calendar: clock.calendar,
        theme: "neon", accent: "magenta", background: "plum", language: "en")
    #expect(snapshot.connected)
    #expect(snapshot.updatedAt == now)
    #expect(snapshot.followUpCount == 2)
    #expect(snapshot.nextFollowUp?.leadID == "lead-arcadie")
    #expect(snapshot.nextFollowUp?.company == leads.first { $0.id == "lead-arcadie" }?.company)
    #expect(snapshot.nextFollowUp?.date == DemoClock.date(23, hour: 16))
    #expect(snapshot.signedRevenue == 27300)
    #expect(snapshot.progress == 0.6825)
    #expect(snapshot.theme == "neon" && snapshot.accent == "magenta" && snapshot.background == "plum")
    #expect(snapshot.language == "en")
    for (target, progress): (Decimal, Double?) in [(100, 1), (0, nil), (-1, nil)] {
        let value = WidgetSnapshot.build(leads: leads, quotes: quotes, appointments: appointments,
            userID: MockVenioAPI.lea.id, monthlyTarget: target, now: now, calendar: clock.calendar)
        #expect(value.progress == progress)
    }
    var refund = try #require(quotes.first { $0.status == .signed && $0.createdBy == MockVenioAPI.lea.id })
    refund.signature.signedAt = now
    refund.lines = [QuoteLine(description: "Avoir", quantity: 1, unitPrice: -10, taxRate: 0)]
    let negative = WidgetSnapshot.build(leads: [], quotes: [refund], appointments: [],
        userID: MockVenioAPI.lea.id, monthlyTarget: 100, now: now, calendar: clock.calendar)
    #expect(negative.progress == 0)
    let empty = WidgetSnapshot.build(leads: leads, quotes: quotes, appointments: appointments,
        userID: nil, monthlyTarget: 40000, now: now, calendar: clock.calendar)
    #expect(!empty.connected && empty.followUpCount == 0 && empty.nextFollowUp == nil)
    #expect(empty.signedRevenue == 0 && empty.monthlyTarget == nil && empty.progress == nil)
}
