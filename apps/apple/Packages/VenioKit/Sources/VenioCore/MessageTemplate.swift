import Foundation

public struct MessageTemplate: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var subject: String
    public var body: String

    public init(id: String, subject: String, body: String) {
        self.id = id
        self.subject = subject
        self.body = body
    }

    public func rendered(contactName: String, company: String, sender: String, missingFirstName: String) -> MessageTemplate {
        let firstName = contactName.split(whereSeparator: \.isWhitespace).first.map(String.init) ?? missingFirstName
        let values = ["firstName": firstName, "company": company, "sender": sender]
        func render(_ text: String) -> String {
            // Substitution en une passe : les données du contact ne deviennent jamais des variables.
            text.components(separatedBy: "{{").enumerated().map { index, part in
                guard index > 0 else { return part }
                guard let end = part.range(of: "}}"), let value = values[String(part[..<end.lowerBound])] else { return "{{" + part }
                return value + part[end.upperBound...]
            }.joined()
        }
        return MessageTemplate(id: id, subject: render(subject), body: render(body))
    }
}
