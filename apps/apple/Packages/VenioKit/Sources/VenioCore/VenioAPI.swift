import Foundation

public protocol VenioAPI: Sendable {
    func currentUser() async throws -> UserSummary
    func leads() async throws -> [Lead]
    func lead(id: String) async throws -> Lead
    func timeline(leadId: String) async throws -> [TimelineEntry]
    func quotes() async throws -> [QuoteProposal]
    func appointments() async throws -> [Appointment]
    func projects() async throws -> [Project]
    func project(id: String) async throws -> ProjectDetail
}

public struct DemoClock: Sendable {
    public let now: Date
    public let calendar: Calendar

    public init(now: Date = DemoClock.date(23, hour: 9, minute: 41)) {
        self.now = now
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Paris")!
        self.calendar = calendar
    }

    public static func date(_ day: Int, month: Int = 10, hour: Int = 0, minute: Int = 0) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Paris")!
        return calendar.date(from: DateComponents(year: 2026, month: month, day: day, hour: hour, minute: minute))!
    }
}
