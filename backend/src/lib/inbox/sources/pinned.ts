import InboxPin from '../../../models/InboxPin.js'
import type { InboxItem, InboxTag } from '../types.js'

const DEFAULT_TAG: InboxTag = { label: 'PIN', color: '#7dd3fc' }

export async function getPinnedItems(userId: string): Promise<InboxItem[]> {
  const pins = await InboxPin.find({
    userId,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  }).lean()

  return pins.map((p: any) => ({
    id: `pin:${p._id}`,
    type: 'pin' as const,
    sourceId: String(p._id),
    title: p.title,
    meta: [`📌 Épinglé ${new Date(p.createdAt).toLocaleDateString('fr-FR')}`],
    urgency: 25,  // base score for pin (matches scoreUrgency)
    tag: p.color ? { ...DEFAULT_TAG, color: p.color } : DEFAULT_TAG,
    actions: [
      { kind: 'open' as const, label: 'Ouvrir ⏎', shortcut: 'enter' },
      { kind: 'unpin' as const, label: 'Désépingler' },
    ],
    link: p.link,
  }))
}
