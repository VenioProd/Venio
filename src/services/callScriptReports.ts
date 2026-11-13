import { apiFetch } from '../lib/api'

/**
 * Rapports hebdomadaires des scripts d'appel (vague 4, lot K).
 * Externe : `/api/commercial/script-reports` (les siens) ;
 * équipe : `/api/admin/crm/script-reports` (les siens, toute l'équipe pour un administrateur du CRM).
 */
export const REP_SCRIPT_REPORTS = '/api/commercial/script-reports'
export const TEAM_SCRIPT_REPORTS = '/api/admin/crm/script-reports'

export type ScriptReportStatus = 'PENDING' | 'READY' | 'SKIPPED' | 'FAILED'

export interface ScriptReportStats {
  calls: number
  reached: number
  conversions: number
  conversionRate: number | null
  targetConversionRate: number
  transcripts: number
  transcriptsAnalyzed: number
  byScript: Array<{ tag: string; calls: number; reached: number; conversions: number }>
}

export interface ScriptReportRow {
  _id: string
  weekKey: string
  weekStart: string
  weekEnd: string
  status: ScriptReportStatus
  skipReason: 'NO_TRANSCRIPT' | 'AI_DISABLED' | null
  stats: ScriptReportStats
  author: { _id: string; name: string } | null
  own: boolean
}

export interface ScriptReportOutput {
  summary: string
  conversionReading: string
  objections: Array<{ label: string; occurrences: number; quotes: string[]; response: string }>
  advancing: Array<{ label: string; quote: string | null }>
  losing: Array<{ label: string; quote: string | null }>
  scriptChanges: Array<{ current: string | null; proposed: string; why: string }>
  droppedQuotes: number
}

export interface ScriptReport extends ScriptReportRow {
  output: ScriptReportOutput | null
  model: string
  errorCode: string | null
  retryable: boolean
  nextRetryAt: string | null
}

export function listScriptReports(base: string, author?: string) {
  const query = author ? `?author=${encodeURIComponent(author)}` : ''
  return apiFetch<{ reports: ScriptReportRow[]; canSeeTeam?: boolean }>(`${base}${query}`)
}

export function getScriptReport(base: string, id: string) {
  return apiFetch<{ report: ScriptReport }>(`${base}/${encodeURIComponent(id)}`)
}
