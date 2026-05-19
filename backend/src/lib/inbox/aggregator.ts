import InboxSnooze from '../../models/InboxSnooze.js'
import type { InboxItem } from './types.js'
import { getDecisionItems } from './sources/decisions.js'
import { getBriefP1Items } from './sources/briefs.js'
import { getLeadItems } from './sources/leads.js'
import { getMessageItems } from './sources/messages.js'
import { getTicketItems } from './sources/tickets.js'
import { getTaskItems } from './sources/tasks.js'
import { getSystemItems } from './sources/system.js'
import { getPinnedItems } from './sources/pinned.js'

export interface BuildInboxOpts {
  includeSnoozed?: boolean
}

export interface InboxResponse {
  items: InboxItem[]
  counts: Record<string, number>
  snoozedCount: number
}

export async function buildInbox(userId: string, opts: BuildInboxOpts = {}): Promise<InboxResponse> {
  const [decisions, briefs, leads, messages, tickets, tasks, system, pins, snoozes] = await Promise.all([
    getDecisionItems(),
    getBriefP1Items(userId),
    getLeadItems(),
    getMessageItems(userId),
    getTicketItems(userId),
    getTaskItems(userId),
    getSystemItems(),
    getPinnedItems(userId),
    InboxSnooze.find({ userId, snoozedUntil: { $gt: new Date() } }).lean(),
  ])

  const snoozeMap = new Map(
    snoozes.map((s: any) => [`${s.itemType}:${s.sourceId}`, new Date(s.snoozedUntil).toISOString()])
  )

  const all: InboxItem[] = [
    ...decisions, ...briefs, ...leads, ...messages,
    ...tickets, ...tasks, ...system, ...pins,
  ].map((it) => {
    const snoozedIso = snoozeMap.get(it.id)
    return snoozedIso ? { ...it, snoozedUntil: snoozedIso } : it
  })

  const items = opts.includeSnoozed
    ? all
    : all.filter((it) => !it.snoozedUntil)

  items.sort((a, b) => b.urgency - a.urgency)

  const counts = items.reduce(
    (acc, it) => {
      acc[it.type] = (acc[it.type] ?? 0) + 1
      acc.all = (acc.all ?? 0) + 1
      return acc
    },
    { all: 0 } as Record<string, number>
  )

  return { items, counts, snoozedCount: snoozeMap.size }
}
