import Lead from '../../../models/Lead.js'
import type { InboxItem, InboxTag } from '../types.js'
import { scoreUrgency } from '../scoreUrgency.js'

const TAG: InboxTag = { label: 'CRM', color: '#0ea5e9' }
const SEVEN_DAYS_MS = 7 * 86400 * 1000

export async function getLeadItems(): Promise<InboxItem[]> {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS)
  const leads = await Lead.find({
    leadTemperature: { $in: ['CHAUD', 'TRES_CHAUD'] },
    status: { $nin: ['WON', 'LOST'] },
    $or: [
      { nextActionAt: { $exists: false } },
      { nextActionAt: null },
      { nextActionAt: { $lt: cutoff } },
    ],
  }).lean()

  return leads.map((l: any) => {
    const daysSince = l.nextActionAt
      ? Math.floor((Date.now() - new Date(l.nextActionAt).getTime()) / 86400000)
      : 999
    return {
      id: `lead:${l._id}`,
      type: 'lead' as const,
      sourceId: String(l._id),
      title: `Relancer ${l.company ?? l.contactName ?? 'lead'}`,
      meta: [
        l.budget ? `🔥 ${l.budget.toLocaleString('fr-FR')}€ potentiel` : '🔥 Hot',
        `${daysSince}j sans contact prévu`,
      ],
      urgency: scoreUrgency({ type: 'lead', daysSinceContact: daysSince }),
      tag: TAG,
      actions: [
        { kind: 'email' as const, label: '✉ Mail' },
        { kind: 'open' as const, label: 'Ouvrir ⏎', shortcut: 'enter' },
        { kind: 'snooze' as const, label: 'S', shortcut: 's' },
      ],
      link: `/admin/crm/leads/${l._id}`,
    }
  })
}
