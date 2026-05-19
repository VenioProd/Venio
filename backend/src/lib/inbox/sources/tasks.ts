import Task from '../../../models/Task.js'
import type { InboxItem, InboxTag } from '../types.js'
import { scoreUrgency } from '../scoreUrgency.js'

const TAG: InboxTag = { label: 'TSK', color: '#a78bfa' }
const TWO_DAYS_MS = 2 * 86400 * 1000

export async function getTaskItems(userId: string): Promise<InboxItem[]> {
  const cutoff = new Date(Date.now() - TWO_DAYS_MS)
  const tasks = await Task.find({
    assignee: userId,
    status: { $ne: 'TERMINE' },
    dueDate: { $lt: cutoff, $ne: null },
  }).lean()

  return tasks.map((t: any) => {
    const daysLate = Math.floor((Date.now() - new Date(t.dueDate).getTime()) / 86400000)
    return {
      id: `task:${t._id}`,
      type: 'task' as const,
      sourceId: String(t._id),
      title: t.title ?? t.titre ?? 'Tâche sans titre',
      meta: [`✓ Tâche en retard · ${daysLate}j`],
      urgency: scoreUrgency({ type: 'task', deadline: t.dueDate }),
      tag: TAG,
      actions: [
        { kind: 'mark_done' as const, label: 'F ✓', shortcut: 'f' },
        { kind: 'open' as const, label: 'Ouvrir ⏎', shortcut: 'enter' },
        { kind: 'snooze' as const, label: 'S', shortcut: 's' },
      ],
      link: `/admin/tasks/${t._id}`,
    }
  })
}
