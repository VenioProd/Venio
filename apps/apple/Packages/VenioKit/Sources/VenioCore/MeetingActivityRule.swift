import Foundation

public enum MeetingActivityRule {
    public static func meeting(appointments: [Appointment], userID: String?, now: Date, calendar: Calendar) -> Appointment? {
        guard let userID else { return nil }
        return appointments.filter {
            guard let end = $0.endsAt else { return false }
            return $0.assignedTo == userID && calendar.isDate($0.startsAt, inSameDayAs: now)
                && end > now && end > $0.startsAt && $0.startsAt.timeIntervalSince(now) < 30 * 60
        }.min {
            $0.startsAt == $1.startsAt ? $0.id < $1.id : $0.startsAt < $1.startsAt
        }
    }
}
