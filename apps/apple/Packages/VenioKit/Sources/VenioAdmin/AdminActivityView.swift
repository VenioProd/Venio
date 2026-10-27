#if !os(watchOS)
import SwiftUI
import VenioTheme

struct AdminActivityView: View {
    @Environment(AdminStore.self) private var store
    @Environment(\.locale) private var locale
    var body: some View {
        AdminSectionContent(section: .activity) {
            if store.activity.isEmpty { AdminEmptyView(title: "Aucune activité") }
            else {
                AdminPage {
                    ForEach(store.activity, id: \.key) { section in
                        VStack(alignment: .leading, spacing: 16) {
                            AdminText(section.title).font(.headline)
                            if section.entries.isEmpty { AdminText("Aucune activité") }
                            ForEach(section.entries) { entry in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(verbatim: entry.title).font(.subheadline.bold())
                                    AdminText(entry.meta).font(.subheadline)
                                    if let date = entry.dueAt {
                                        Text(verbatim: AdminFormats(locale: locale).relative(date, to: store.clock.now)).font(.caption)
                                    }
                                }
                                Divider()
                            }
                            if section.hasMore { AdminWebLink(title: "Voir plus sur le web") }
                        }.frame(maxWidth: .infinity, alignment: .leading).venioCard()
                    }
                }
            }
        }
    }
}
#endif
