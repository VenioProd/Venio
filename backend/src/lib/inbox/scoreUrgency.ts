import type { InboxItemType } from './types.js'

export interface UrgencyInput {
  type: InboxItemType
  priority?: string          // 'URGENTE' | 'HAUTE' | 'NORMALE' | 'BASSE' | 'P1' | 'P2' | 'P3'
  deadline?: Date | null
  daysSinceContact?: number  // for leads
}

const BASE: Record<InboxItemType, number> = {
  decision: 70,
  brief: 60,
  lead: 50,
  message: 40,
  ticket: 50,
  task: 30,
  system: 35,
  pin: 25,
}

const PRIORITY_BONUS: Record<string, number> = {
  URGENTE: 30,
  HAUTE: 20,
  NORMALE: 5,
  BASSE: 0,
  P1: 20,
  P2: 10,
  P3: 0,
}

export function scoreUrgency(input: UrgencyInput): number {
  let score = BASE[input.type] ?? 0
  if (input.priority) score += PRIORITY_BONUS[input.priority] ?? 0
  if (input.deadline && input.deadline.getTime() < Date.now()) score += 20
  if (input.daysSinceContact && input.daysSinceContact > 14) score += 10
  return Math.min(100, score)
}
