#if !os(watchOS)
import CoreSpotlight
import UniformTypeIdentifiers
import VenioCore

@MainActor final class SpotlightIndex {
    static let shared = SpotlightIndex()
    private var work: Task<Void, Never>?
    private var revision = 0

    func replace(leads: [Lead], projects: [Project]) {
        let attributes = leads.map(SpotlightAttributes.init(lead:)) + projects.map(SpotlightAttributes.init(project:))
        enqueue(attributes)
    }
    func purge() { enqueue([]) }

    private func enqueue(_ attributes: [SpotlightAttributes]) {
        revision += 1
        let expected = revision
        let previous = work
        work = Task {
            await previous?.value
            let index = CSSearchableIndex.default()
            do {
                try await index.deleteAllSearchableItems()
                guard expected == revision, !attributes.isEmpty else { return }
                let items = attributes.map { value in
                    let set = CSSearchableItemAttributeSet(contentType: .content)
                    set.title = value.title
                    set.contentDescription = value.summary
                    set.keywords = value.keywords
                    return CSSearchableItem(uniqueIdentifier: value.identifier, domainIdentifier: value.domain, attributeSet: set)
                }
                try await index.indexSearchableItems(items)
            } catch { return }
        }
    }
}
#endif
