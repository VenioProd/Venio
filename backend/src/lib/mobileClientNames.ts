import User from '../models/User.js'

// `client` reste un identifiant : le portefeuille de devis le compare à des ids.
// Le nom à afficher voyage à part, dans `clientName`.
export async function withClientNames<T extends { client?: unknown }>(items: T[]) {
  const ids = [...new Set(items.map((item) => String(item.client ?? '')).filter(Boolean))]
  const clients = ids.length
    ? await User.find({ _id: { $in: ids } })
        .select('name companyName')
        .lean()
    : []
  const names = new Map(clients.map((client) => [String(client._id), client.companyName || client.name]))
  return items.map((item) => ({ ...item, clientName: names.get(String(item.client ?? '')) ?? '' }))
}
