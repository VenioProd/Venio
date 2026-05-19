import MissionBrief from '../../../models/MissionBrief.js'
import type { InboxItem, InboxTag } from '../types.js'
import { scoreUrgency } from '../scoreUrgency.js'

const TAG: InboxTag = { label: 'P1', color: '#f59e0b' }

export async function getBriefP1Items(userId: string): Promise<InboxItem[]> {
  const briefs = await MissionBrief.find({
    briefPriority: 'P1',
    statut: { $nin: ['VALIDE', 'LIVRE'] },
    deadline: { $lt: new Date() },
    $or: [{ destinataire: userId }, { destinataire: { $exists: false } }, { destinataire: null }],
  }).lean()

  return briefs.map((b: any) => ({
    id: `brief:${b._id}`,
    type: 'brief' as const,
    sourceId: String(b._id),
    title: b.intitule ?? 'Brief sans titre',
    meta: [`📂 P1 · échéance ${new Date(b.deadline).toLocaleDateString('fr-FR')}`],
    urgency: scoreUrgency({ type: 'brief', priority: 'P1', deadline: b.deadline }),
    tag: TAG,
    actions: [
      { kind: 'open' as const, label: 'Ouvrir ⏎', shortcut: 'enter' },
      { kind: 'snooze' as const, label: 'S', shortcut: 's' },
    ],
    link: `/admin/briefs/${b._id}`,
  }))
}
