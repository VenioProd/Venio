import { heatGridError } from './callAnalysis/heat.js'
import { CALL_COUNTRIES } from './telephony/countries.js'

/**
 * Contrôle, à l'enregistrement, des quatre blocs de réglages du poste d'appel
 * (`telephony`, `callRecording`, `callTranscription`, `callAnalysis`).
 *
 * Chaque bloc s'enregistre en entier : un bloc partiel écraserait les champs
 * absents (la plage d'appel disparaîtrait et la garde d'appel planterait). Une
 * clé inconnue est refusée plutôt qu'ignorée en silence.
 */

export class SettingsBlockError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message)
  }
}

const fail = (field: string, message: string): never => {
  throw new SettingsBlockError(field, message)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function exactKeys(field: string, value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) return fail(field, `${field} : objet attendu`)
  const unknown = Object.keys(value).find((key) => !keys.includes(key))
  if (unknown) fail(`${field}.${unknown}`, `${field}.${unknown} : réglage inconnu`)
  const missing = keys.find((key) => value[key] === undefined)
  if (missing) fail(`${field}.${missing}`, `${field}.${missing} : valeur manquante (le bloc s'enregistre en entier)`)
  return value
}

const boolean = (field: string, value: unknown): boolean =>
  typeof value === 'boolean' ? value : fail(field, `${field} : booléen attendu`)

function integer(field: string, value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    return fail(field, `${field} : entier entre ${min} et ${max} attendu`)
  return value
}

function text(field: string, value: unknown, max: number, required: boolean): string {
  if (typeof value !== 'string') return fail(field, `${field} : texte attendu`)
  const trimmed = value.trim()
  if (required && !trimmed) return fail(field, `${field} : texte requis`)
  if (trimmed.length > max) return fail(field, `${field} : ${max} caractères au plus`)
  return trimmed
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

/** Réglages du dialer (lot I) : facultatifs, pour les écrans qui ne les envoient pas encore. */
function validateDialer(value: unknown) {
  const block = exactKeys('telephony.dialer', value, ['voicemailDetection', 'previewDelaySec', 'powerDelaySec'])
  return {
    voicemailDetection: boolean('telephony.dialer.voicemailDetection', block.voicemailDetection),
    previewDelaySec: integer('telephony.dialer.previewDelaySec', block.previewDelaySec, 0, 120),
    powerDelaySec: integer('telephony.dialer.powerDelaySec', block.powerDelaySec, 0, 60),
  }
}

/** Lot P : un pays par entrée, tous ceux que Venio sait situer (`CALL_COUNTRIES`), ni plus ni moins. */
function validateCountries(value: unknown) {
  if (!Array.isArray(value) || value.length !== CALL_COUNTRIES.length)
    fail('telephony.countries', `telephony.countries : ${CALL_COUNTRIES.length} pays attendus`)
  const rules = new Map(
    (value as unknown[]).map((item, index) => {
      const field = `telephony.countries[${index}]`
      const rule = exactKeys(field, item, ['code', 'enabled', 'defaultCallerId'])
      if (typeof rule.code !== 'string' || !(CALL_COUNTRIES as readonly string[]).includes(rule.code))
        fail(`${field}.code`, `${field}.code : pays inconnu`)
      return [
        rule.code as string,
        {
          code: rule.code as string,
          enabled: boolean(`${field}.enabled`, rule.enabled),
          defaultCallerId: boolean(`${field}.defaultCallerId`, rule.defaultCallerId),
        },
      ] as const
    }),
  )
  if (rules.size !== CALL_COUNTRIES.length) fail('telephony.countries', 'telephony.countries : pays en double')
  return CALL_COUNTRIES.map((code) => rules.get(code)!)
}

function validateTelephony(value: unknown) {
  const { dialer, ...rest } = isRecord(value) ? value : { dialer: undefined }
  const block = exactKeys('telephony', isRecord(value) ? rest : value, [
    'callingHours',
    'attemptCapPerDay',
    'attemptWindow',
    'countries',
  ])
  // Lot P : la plage suit le fuseau du prospect ; un ancien écran peut encore envoyer `timezone`, ignoré.
  const { timezone: _legacyTimezone, ...hourFields } = isRecord(block.callingHours)
    ? block.callingHours
    : { timezone: undefined }
  const hours = exactKeys('telephony.callingHours', isRecord(block.callingHours) ? hourFields : block.callingHours, [
    'days',
    'start',
    'end',
  ])
  const days = hours.days
  if (!Array.isArray(days) || days.length < 1 || days.length > 7 || new Set(days).size !== days.length)
    fail('telephony.callingHours.days', 'telephony.callingHours.days : de 1 à 7 jours distincts attendus')
  const checkedDays = (days as unknown[]).map((day) => integer('telephony.callingHours.days', day, 0, 6))
  const start = hours.start
  const end = hours.end
  if (typeof start !== 'string' || !CLOCK.test(start))
    fail('telephony.callingHours.start', 'telephony.callingHours.start : heure HH:MM attendue')
  if (typeof end !== 'string' || !CLOCK.test(end))
    fail('telephony.callingHours.end', 'telephony.callingHours.end : heure HH:MM attendue')
  if ((end as string) <= (start as string))
    fail('telephony.callingHours.end', "telephony.callingHours.end : l'heure de fin doit suivre l'heure de début")
  const window = exactKeys('telephony.attemptWindow', block.attemptWindow, ['days', 'max'])
  const attemptCapPerDay = integer('telephony.attemptCapPerDay', block.attemptCapPerDay, 1, 20)
  const attemptWindow = {
    days: integer('telephony.attemptWindow.days', window.days, 1, 60),
    max: integer('telephony.attemptWindow.max', window.max, 1, 100),
  }
  if (attemptWindow.max < attemptCapPerDay)
    fail('telephony.attemptWindow.max', 'telephony.attemptWindow.max : au moins le plafond quotidien')
  return {
    callingHours: {
      days: [...checkedDays].sort((a, b) => a - b),
      start: start as string,
      end: end as string,
    },
    attemptCapPerDay,
    attemptWindow,
    countries: validateCountries(block.countries),
    ...(dialer === undefined ? {} : { dialer: validateDialer(dialer) }),
  }
}

function validateRecording(value: unknown) {
  const block = exactKeys('callRecording', value, ['enabled', 'notice', 'keepAudioDays'])
  const notice = exactKeys('callRecording.notice', block.notice, ['enabled', 'text'])
  const noticeEnabled = boolean('callRecording.notice.enabled', notice.enabled)
  return {
    enabled: boolean('callRecording.enabled', block.enabled),
    notice: {
      enabled: noticeEnabled,
      text: text('callRecording.notice.text', notice.text, 300, noticeEnabled),
    },
    keepAudioDays: integer('callRecording.keepAudioDays', block.keepAudioDays, 0, 180),
  }
}

function validateTranscription(value: unknown) {
  // `live` (lot J) est facultatif : absent, la transcription en direct est coupée.
  const block = exactKeys('callTranscription', isRecord(value) ? { live: false, ...value } : value, [
    'enabled',
    'language',
    'retentionMonths',
    'live',
  ])
  const language = text('callTranscription.language', block.language, 5, true).toLowerCase()
  if (!/^[a-z]{2}(_[a-z]{2})?$/.test(language))
    fail('callTranscription.language', 'callTranscription.language : code de langue attendu (fr, en, en_us…)')
  return {
    enabled: boolean('callTranscription.enabled', block.enabled),
    language,
    retentionMonths: integer('callTranscription.retentionMonths', block.retentionMonths, 1, 36),
    live: boolean('callTranscription.live', block.live),
  }
}

function validateAnalysis(value: unknown) {
  const block = exactKeys('callAnalysis', value, ['enabled', 'heatGrid', 'retentionMonths'])
  const grid = exactKeys('callAnalysis.heatGrid', block.heatGrid, ['criteria', 'thresholds'])
  const thresholds = exactKeys('callAnalysis.heatGrid.thresholds', grid.thresholds, ['tiede', 'chaud', 'tresChaud'])
  if (!Array.isArray(grid.criteria))
    fail('callAnalysis.heatGrid.criteria', 'callAnalysis.heatGrid.criteria : liste attendue')
  const criteria = (grid.criteria as unknown[]).map((item, index) => {
    const field = `callAnalysis.heatGrid.criteria[${index}]`
    const criterion = exactKeys(field, item, ['key', 'label', 'max', 'description'])
    return {
      key: text(`${field}.key`, criterion.key, 40, true),
      label: text(`${field}.label`, criterion.label, 80, true),
      max: typeof criterion.max === 'number' ? criterion.max : fail(`${field}.max`, `${field}.max : nombre attendu`),
      description: text(`${field}.description`, criterion.description, 300, false),
    }
  })
  const heatGrid = {
    criteria,
    thresholds: {
      tiede: thresholds.tiede as number,
      chaud: thresholds.chaud as number,
      tresChaud: thresholds.tresChaud as number,
    },
  }
  // Mêmes règles que celles que le serveur applique à l'exécution (une grille invalide y serait ignorée).
  const error = heatGridError(heatGrid)
  if (error) fail('callAnalysis.heatGrid', error)
  // Un niveau inatteignable est une grille incohérente : le total des points positifs doit couvrir « très chaud ».
  const reachable = Math.min(
    100,
    criteria.reduce((sum, criterion) => sum + Math.max(criterion.max, 0), 0),
  )
  if (reachable < heatGrid.thresholds.tresChaud)
    fail(
      'callAnalysis.heatGrid',
      `Le total atteignable (${reachable}) est inférieur au seuil « très chaud » (${heatGrid.thresholds.tresChaud})`,
    )
  return {
    enabled: boolean('callAnalysis.enabled', block.enabled),
    heatGrid,
    retentionMonths: integer('callAnalysis.retentionMonths', block.retentionMonths, 1, 12),
  }
}

const VALIDATORS = {
  telephony: validateTelephony,
  callRecording: validateRecording,
  callTranscription: validateTranscription,
  callAnalysis: validateAnalysis,
} as const

/** Les blocs qui ne s'enregistrent qu'entiers, jamais par chemin pointé. */
export const CALL_AI_BLOCKS = Object.keys(VALIDATORS)

/**
 * Valide et reconstruit les blocs présents dans `updates` (modifié sur place).
 * Lève `SettingsBlockError` au premier défaut ; ne touche pas aux autres clés.
 */
export function validateCallAiSettings(updates: Record<string, unknown>): void {
  for (const [name, validate] of Object.entries(VALIDATORS)) {
    if (updates[name] !== undefined) updates[name] = validate(updates[name])
  }
}
