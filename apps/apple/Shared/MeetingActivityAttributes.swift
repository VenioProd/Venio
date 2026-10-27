#if os(iOS)
import ActivityKit
import Foundation

struct MeetingActivityAttributes: ActivityAttributes, Equatable, Sendable {
    struct ContentState: Codable, Hashable, Sendable {
        enum Status: String, Codable, Sendable { case upcoming, ongoing, ended }
        var displayedAt: Date
        var status: Status
    }

    var meetingID: String
    var title: String
    var company: String
    var contact: String
    var startsAt: Date
    var endsAt: Date
    var phone: String?
    var leadID: String?
}
#endif
