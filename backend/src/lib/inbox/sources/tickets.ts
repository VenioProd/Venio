import InternalTicket from '../../../models/InternalTicket.js'
import type { InboxItem, InboxTag } from '../types.js'
import { scoreUrgency } from '../scoreUrgency.js'

const TAG: InboxTag = { label: 'TKT', color: '#22c55e' }

// Closed statuses per InternalTicket schema: 'RESOLU' | 'FERME'
const CLOSED_STATUSES = ['RESOLU', 'FERME']

export async function getTicketItems(userId: string): Promise<InboxItem[]> {
  // InternalTicket has no `assignee` field — tickets are authored by users.
  // We surface open tickets created by the given user.
  const tickets = await InternalTicket.find({
    authorId: userId,
    status: { $nin: CLOSED_STATUSES },
  }).lean()

  return tickets.map((t: any) => ({
    id: `ticket:${t._id}`,
    type: 'ticket' as const,
    sourceId: String(t._id),
    title: t.title ?? 'Ticket sans titre',
    meta: [
      `🟢 Ticket interne`,
      t.priority ? `priorité ${t.priority}` : '',
      `ouvert ${new Date(t.createdAt).toLocaleDateString('fr-FR')}`,
    ].filter(Boolean),
    urgency: scoreUrgency({ type: 'ticket', priority: t.priority }),
    tag: TAG,
    actions: [{ kind: 'open' as const, label: 'Ouvrir ⏎', shortcut: 'enter' }],
    link: `/admin/tickets/${t._id}`,
  }))
}
