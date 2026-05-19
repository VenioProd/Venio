import Decision from '../../../models/Decision.js'
import type { InboxItem, InboxTag } from '../types.js'
import { scoreUrgency } from '../scoreUrgency.js'

const PRIORITY_TAG: Record<string, InboxTag> = {
  URGENTE: { label: 'URG', color: '#ff0080' },
  HAUTE:   { label: 'HAUTE', color: '#f59e0b' },
  NORMALE: { label: 'NORM', color: '#0ea5e9' },
  BASSE:   { label: 'BASSE', color: '#606060' },
}

export async function getDecisionItems(): Promise<InboxItem[]> {
  const decisions = await Decision.find({ status: 'PENDING' })
    .sort({ priority: -1, createdAt: -1 })
    .lean()

  return decisions.map((d: any) => ({
    id: `decision:${d._id}`,
    type: 'decision' as const,
    sourceId: String(d._id),
    title: d.title,
    meta: [
      `📋 ${d.category}`,
      d.submittedByName ? `par ${d.submittedByName}` : (d.submittedBy?.name ? `par ${d.submittedBy.name}` : ''),
      `créée ${new Date(d.createdAt).toLocaleDateString('fr-FR')}`,
    ].filter(Boolean),
    urgency: scoreUrgency({ type: 'decision', priority: d.priority, deadline: d.deadline ?? null }),
    tag: PRIORITY_TAG[d.priority] ?? PRIORITY_TAG.NORMALE,
    actions: [
      { kind: 'approve' as const, label: 'A ✓', shortcut: 'a' },
      { kind: 'reject' as const, label: 'R ✗', shortcut: 'r' },
      { kind: 'snooze' as const, label: 'S ⏰', shortcut: 's' },
    ],
    link: `/admin/decisions/${d._id}`,
  }))
}
