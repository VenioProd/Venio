import type { MessageKey } from '../../../i18n'
import type { CrmSettingsData } from './types'

/**
 * Réglages du poste d'appel : formes, valeurs de départ et contrôles. Les contrôles
 * reprennent ceux du serveur (backend/src/lib/callAiSettings.ts) : l'écran refuse
 * avant l'envoi, le serveur reste l'autorité.
 */

export interface TelephonySettings {
  callingHours: { timezone: string; days: number[]; start: string; end: string }
  attemptCapPerDay: number
  /** Composition enchaînée et détection de messagerie (lot I). */
  dialer: { voicemailDetection: boolean; previewDelaySec: number; powerDelaySec: number }
}
export interface RecordingSettings {
  enabled: boolean
  notice: { enabled: boolean; text: string }
  keepAudioDays: number
}
export interface TranscriptionSettings {
  enabled: boolean
  language: string
  retentionMonths: number
  /** Transcription en direct pendant l'appel (texte éphémère), désactivée par défaut. */
  live: boolean
}
export interface HeatCriterion {
  key: string
  label: string
  max: number
  description: string
}
export interface HeatThresholds {
  tiede: number
  chaud: number
  tresChaud: number
}
export interface AnalysisSettings {
  enabled: boolean
  heatGrid: { criteria: HeatCriterion[]; thresholds: HeatThresholds }
  retentionMonths: number
}

/** Ce que ce serveur sait faire, d'après ses variables d'environnement (GET /settings → providers). */
export interface Providers {
  telephony: boolean
  transcription: boolean
  analysis: boolean
}

export interface Issue {
  key: MessageKey
  params?: Record<string, string | number>
}

export const NOTICE_MAX = 300
export const DEFAULT_NOTICE =
  'Cet appel est enregistré et transcrit pour le suivi de votre demande. Vous pouvez vous y opposer à tout moment.'
export const MAX_CRITERIA = 12

export const DEFAULT_TELEPHONY: TelephonySettings = {
  callingHours: { timezone: 'Europe/Paris', days: [1, 2, 3, 4, 5], start: '09:00', end: '20:00' },
  attemptCapPerDay: 3,
  dialer: { voicemailDetection: true, previewDelaySec: 10, powerDelaySec: 3 },
}
export const DEFAULT_RECORDING: RecordingSettings = {
  enabled: true,
  notice: { enabled: true, text: DEFAULT_NOTICE },
  keepAudioDays: 0,
}
export const DEFAULT_TRANSCRIPTION: TranscriptionSettings = {
  enabled: true,
  language: 'fr',
  retentionMonths: 12,
  live: false,
}
export const DEFAULT_CRITERIA: HeatCriterion[] = [
  {
    key: 'need',
    label: 'Besoin exprimé',
    max: 25,
    description: 'Le prospect décrit lui-même un problème ou un projet',
  },
  {
    key: 'commitment',
    label: 'Engagement pris',
    max: 20,
    description: 'Rendez-vous, demande de devis, envoi de documents accepté',
  },
  { key: 'timeline', label: 'Échéance', max: 20, description: 'Une date ou un horizon cité' },
  { key: 'budget', label: 'Budget', max: 15, description: 'Un montant, une fourchette ou une enveloppe confirmée' },
  { key: 'decisionMaker', label: 'Décideur', max: 15, description: "L'interlocuteur décide, ou nomme qui décide" },
  {
    key: 'blockingObjection',
    label: 'Objection bloquante',
    max: -20,
    description: 'Refus net, prestataire en place sous contrat, hors cible',
  },
]
export const DEFAULT_THRESHOLDS: HeatThresholds = { tiede: 25, chaud: 50, tresChaud: 75 }
export const DEFAULT_ANALYSIS: AnalysisSettings = {
  enabled: true,
  heatGrid: { criteria: DEFAULT_CRITERIA, thresholds: DEFAULT_THRESHOLDS },
  retentionMonths: 12,
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

type Raw = Record<string, unknown> | undefined | null
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)
const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
const str = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)

export function readTelephony(settings: CrmSettingsData): TelephonySettings {
  const raw = obj(settings.telephony as Raw)
  const hours = obj(raw.callingHours)
  const base = DEFAULT_TELEPHONY
  return {
    callingHours: {
      timezone: str(hours.timezone, base.callingHours.timezone),
      days: Array.isArray(hours.days) ? (hours.days as number[]).filter(Number.isInteger) : [...base.callingHours.days],
      start: str(hours.start, base.callingHours.start),
      end: str(hours.end, base.callingHours.end),
    },
    attemptCapPerDay: num(raw.attemptCapPerDay, base.attemptCapPerDay),
    dialer: {
      voicemailDetection: bool(obj(raw.dialer).voicemailDetection, base.dialer.voicemailDetection),
      previewDelaySec: num(obj(raw.dialer).previewDelaySec, base.dialer.previewDelaySec),
      powerDelaySec: num(obj(raw.dialer).powerDelaySec, base.dialer.powerDelaySec),
    },
  }
}

export function readRecording(settings: CrmSettingsData): RecordingSettings {
  const raw = obj(settings.callRecording as Raw)
  const notice = obj(raw.notice)
  return {
    enabled: bool(raw.enabled, DEFAULT_RECORDING.enabled),
    notice: {
      enabled: bool(notice.enabled, DEFAULT_RECORDING.notice.enabled),
      text: str(notice.text, DEFAULT_RECORDING.notice.text),
    },
    keepAudioDays: num(raw.keepAudioDays, DEFAULT_RECORDING.keepAudioDays),
  }
}

export function readTranscription(settings: CrmSettingsData): TranscriptionSettings {
  const raw = obj(settings.callTranscription as Raw)
  return {
    enabled: bool(raw.enabled, DEFAULT_TRANSCRIPTION.enabled),
    language: str(raw.language, DEFAULT_TRANSCRIPTION.language),
    retentionMonths: num(raw.retentionMonths, DEFAULT_TRANSCRIPTION.retentionMonths),
    live: bool(raw.live, DEFAULT_TRANSCRIPTION.live),
  }
}

export function readAnalysis(settings: CrmSettingsData): AnalysisSettings {
  const raw = obj(settings.callAnalysis as Raw)
  const grid = obj(raw.heatGrid)
  const thresholds = obj(grid.thresholds)
  const criteria = Array.isArray(grid.criteria)
    ? (grid.criteria as unknown[]).map((item) => {
        const c = obj(item)
        return { key: str(c.key, ''), label: str(c.label, ''), max: num(c.max, 0), description: str(c.description, '') }
      })
    : clone(DEFAULT_CRITERIA)
  return {
    enabled: bool(raw.enabled, DEFAULT_ANALYSIS.enabled),
    heatGrid: {
      criteria,
      thresholds: {
        tiede: num(thresholds.tiede, DEFAULT_THRESHOLDS.tiede),
        chaud: num(thresholds.chaud, DEFAULT_THRESHOLDS.chaud),
        tresChaud: num(thresholds.tresChaud, DEFAULT_THRESHOLDS.tresChaud),
      },
    },
    retentionMonths: num(raw.retentionMonths, DEFAULT_ANALYSIS.retentionMonths),
  }
}

export const defaultAnalysisGrid = () => clone(DEFAULT_ANALYSIS.heatGrid)

const isInt = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

export function telephonyIssues(value: TelephonySettings): Issue[] {
  const issues: Issue[] = []
  const hours = value.callingHours
  if (hours.days.length === 0) issues.push({ key: 'crmCallAi.tel.err.days' })
  if (!CLOCK.test(hours.start) || !CLOCK.test(hours.end)) issues.push({ key: 'crmCallAi.tel.err.clock' })
  else if (hours.end <= hours.start) issues.push({ key: 'crmCallAi.tel.err.order' })
  if (!hours.timezone || !validTimezone(hours.timezone)) issues.push({ key: 'crmCallAi.tel.err.timezone' })
  if (!isInt(value.attemptCapPerDay, 1, 20)) issues.push({ key: 'crmCallAi.tel.err.cap' })
  if (!isInt(value.dialer.previewDelaySec, 0, 120) || !isInt(value.dialer.powerDelaySec, 0, 60))
    issues.push({ key: 'calls.dialer.settings.err' })
  return issues
}

export function recordingIssues(value: RecordingSettings): Issue[] {
  const issues: Issue[] = []
  if (!isInt(value.keepAudioDays, 0, 180)) issues.push({ key: 'crmCallAi.rec.err.keep' })
  if (value.notice.enabled && !value.notice.text.trim()) issues.push({ key: 'crmCallAi.rec.err.noticeEmpty' })
  if (value.notice.text.trim().length > NOTICE_MAX)
    issues.push({ key: 'crmCallAi.rec.err.noticeLong', params: { max: NOTICE_MAX } })
  return issues
}

export function transcriptionIssues(value: TranscriptionSettings): Issue[] {
  const issues: Issue[] = []
  if (!/^[a-z]{2}(_[a-z]{2})?$/.test(value.language.trim().toLowerCase()))
    issues.push({ key: 'crmCallAi.tr.err.language' })
  if (!isInt(value.retentionMonths, 1, 36)) issues.push({ key: 'crmCallAi.tr.err.retention' })
  return issues
}

/** Total des points positifs, plafonné à 100 : le maximum qu'un appel peut atteindre. */
export function reachableTotal(criteria: HeatCriterion[]): number {
  return Math.min(
    100,
    criteria.reduce((sum, c) => sum + (Number.isFinite(c.max) ? Math.max(c.max, 0) : 0), 0),
  )
}

/** Total des points négatifs : le plus qu'un appel peut perdre. */
export function penaltyTotal(criteria: HeatCriterion[]): number {
  return criteria.reduce((sum, c) => sum + (Number.isFinite(c.max) ? Math.min(c.max, 0) : 0), 0)
}

const KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/

export function analysisIssues(value: AnalysisSettings): Issue[] {
  const issues: Issue[] = []
  const { criteria, thresholds } = value.heatGrid
  if (!isInt(value.retentionMonths, 1, 12)) issues.push({ key: 'crmCallAi.an.err.retention' })
  if (criteria.length < 1 || criteria.length > MAX_CRITERIA)
    issues.push({ key: 'crmCallAi.an.err.count', params: { max: MAX_CRITERIA } })
  const seen = new Set<string>()
  criteria.forEach((c, index) => {
    const n = index + 1
    if (!KEY.test(c.key)) issues.push({ key: 'crmCallAi.an.err.key', params: { n } })
    else if (seen.has(c.key)) issues.push({ key: 'crmCallAi.an.err.dupKey', params: { n, key: c.key } })
    seen.add(c.key)
    if (!c.label.trim()) issues.push({ key: 'crmCallAi.an.err.label', params: { n } })
    if (!Number.isInteger(c.max) || c.max === 0 || Math.abs(c.max) > 100)
      issues.push({ key: 'crmCallAi.an.err.max', params: { n } })
  })
  const { tiede, chaud, tresChaud } = thresholds
  if (![tiede, chaud, tresChaud].every((t) => isInt(t, 1, 100)) || !(tiede < chaud && chaud < tresChaud))
    issues.push({ key: 'crmCallAi.an.err.thresholds' })
  else if (reachableTotal(criteria) < tresChaud)
    issues.push({ key: 'crmCallAi.an.err.unreachable', params: { total: reachableTotal(criteria), max: tresChaud } })
  return issues
}

export const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
