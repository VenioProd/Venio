import Foundation
import Testing
@testable import VenioCore

@Test func meetingActivityStartsWithinThirtyMinutesAndEndsAtMeetingEnd() {
    let start = DemoClock.date(23, hour: 14)
    let end = DemoClock.date(23, hour: 15)
    let calendar = DemoClock().calendar
    let meeting = Appointment(id: "first", leadId: "lead", title: "Démo", startsAt: start,
                              assignedTo: "me", location: "", endsAt: end)
    func selected(_ appointments: [Appointment], _ now: Date, userID: String? = "me") -> String? {
        MeetingActivityRule.meeting(appointments: appointments, userID: userID, now: now, calendar: calendar)?.id
    }
    #expect(selected([meeting], start.addingTimeInterval(-1800)) == nil)
    #expect(selected([meeting], start.addingTimeInterval(-1799)) == "first")
    #expect(selected([meeting], start) == "first")
    #expect(selected([meeting], end.addingTimeInterval(-1)) == "first")
    #expect(selected([meeting], end) == nil)
    #expect(selected([meeting], end.addingTimeInterval(1)) == nil)
    #expect(selected([], start) == nil)
    #expect(selected([meeting], start, userID: nil) == nil)
    #expect(selected([meeting], start, userID: "other") == nil)
    var later = meeting
    later.id = "later"
    later.startsAt = start.addingTimeInterval(300)
    #expect(selected([later, meeting], start.addingTimeInterval(-60)) == "first")
    var tomorrow = meeting
    tomorrow.startsAt = calendar.date(byAdding: .day, value: 1, to: start)!
    tomorrow.endsAt = calendar.date(byAdding: .day, value: 1, to: end)!
    #expect(selected([tomorrow], start) == nil)
    var noEnd = meeting
    noEnd.endsAt = nil
    #expect(selected([noEnd], start) == nil)
}
