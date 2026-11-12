import Notification from '../models/Notification.js'
import { BulkItemError, parseBulkIds, runBulk, type BulkResult } from './bulk.js'

export const NOTIFICATION_BULK_ACTIONS = ['read', 'unread', 'archive', 'unarchive', 'delete'] as const
export type NotificationBulkAction = (typeof NOTIFICATION_BULK_ACTIONS)[number]

export type NotificationBulkParse =
  { ok: true; ids: string[]; action: NotificationBulkAction } | { ok: false; error: string }

/** Valide le corps `{ ids, action }` (ids : 1 à 200 ObjectId). */
export function parseNotificationBulkBody(body: unknown): NotificationBulkParse {
  const b = (body ?? {}) as Record<string, unknown>
  const parsed = parseBulkIds(b.ids)
  if (!parsed.ok) return parsed
  if (typeof b.action !== 'string' || !(NOTIFICATION_BULK_ACTIONS as readonly string[]).includes(b.action)) {
    return { ok: false, error: `action doit valoir ${NOTIFICATION_BULK_ACTIONS.join(', ')}` }
  }
  if (b.patch !== undefined) return { ok: false, error: 'patch n’est pas pris en charge' }
  return { ok: true, ids: parsed.ids, action: b.action as NotificationBulkAction }
}

/**
 * Applique l'action groupée. Avec `recipient` (interface admin), une notification
 * n'est accessible qu'à son destinataire : celle d'un autre est reportée « non trouvée ».
 * Sans `recipient` (API agent), mêmes droits que les routes unitaires agent : toutes.
 */
export async function applyNotificationBulk(
  input: { ids: string[]; action: NotificationBulkAction },
  ctx: { recipient?: string } = {},
): Promise<BulkResult> {
  const { ids, action } = input
  return runBulk(ids, async (id) => {
    const filter: Record<string, unknown> = { _id: id }
    if (ctx.recipient) filter.recipient = ctx.recipient
    if (action === 'delete') {
      const res = await Notification.deleteOne(filter)
      if (res.deletedCount === 0) throw new BulkItemError('Notification non trouvée')
      return
    }
    const set: Record<string, unknown> =
      action === 'read'
        ? { isRead: true }
        : action === 'unread'
          ? { isRead: false }
          : action === 'archive'
            ? { archivedAt: new Date() }
            : { archivedAt: null }
    const res = await Notification.updateOne(filter, { $set: set })
    if (res.matchedCount === 0) throw new BulkItemError('Notification non trouvée')
  })
}
