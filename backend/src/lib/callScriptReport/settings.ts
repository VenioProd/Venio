import User from '../../models/User.js'
import { ADMIN_ROLES } from '../permissions.js'

/**
 * Réglages du rapport hebdomadaire des scripts (`CrmSettings.callScriptReport`).
 * Le bloc s'enregistre en entier, comme les autres blocs du poste d'appel.
 */
export interface CallScriptReportSettings {
  enabled: boolean
  /** Jour de production, 0 = dimanche … 6 = samedi ; le rapport couvre la dernière semaine (lundi-dimanche) achevée. */
  day: number
  /** Chaque auteur reçoit son propre rapport par e-mail. */
  emailAuthors: boolean
  /** Copie des rapports des membres de l'équipe (jamais de ceux des externes). */
  recipients: string[]
  /** Vide : `CALL_SCRIPT_REPORT_MODEL`, sinon le modèle de l'analyse d'appel. */
  model: string
  /** Plafond de jetons envoyés au modèle par rapport : les transcripts au-delà sont laissés de côté. */
  maxInputTokens: number
  /** Objectif de conversion (rendez-vous obtenus sur prospects joints), en %. */
  targetConversionRate: number
}

export const DEFAULT_CALL_SCRIPT_REPORT_SETTINGS: CallScriptReportSettings = {
  enabled: false,
  day: 1,
  emailAuthors: true,
  recipients: [],
  model: '',
  maxInputTokens: 60_000,
  targetConversionRate: 40,
}

export const MAX_INPUT_TOKENS_RANGE = [5_000, 200_000] as const
const KEYS = Object.keys(DEFAULT_CALL_SCRIPT_REPORT_SETTINGS) as (keyof CallScriptReportSettings)[]
const MODEL_ID = /^claude-[a-z0-9.-]{1,60}$/
const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RECIPIENTS_MAX = 20

export function scriptReportSettings(value: Partial<CallScriptReportSettings> | null | undefined) {
  return { ...DEFAULT_CALL_SCRIPT_REPORT_SETTINGS, ...(value ?? {}) }
}

type Check = { ok: true; value: CallScriptReportSettings } | { ok: false; field: string; error: string }

function allowedDomains(): string[] {
  return (process.env.CRM_REPORT_ALLOWED_DOMAINS ?? 'venio.paris')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
}

/**
 * Contrôle du bloc à l'enregistrement. Les destinataires en copie suivent la
 * règle du rapport hebdomadaire du CRM : membres actifs de l'équipe, ou
 * adresses du domaine de l'entreprise.
 */
export async function validateScriptReportSettings(input: unknown): Promise<Check> {
  const field = (key: string) => `callScriptReport.${key}`
  const fail = (key: string, error: string): Check => ({
    ok: false,
    field: field(key),
    error: `${field(key)} : ${error}`,
  })
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('', 'objet attendu')
  const value = input as Record<string, unknown>
  const unknown = Object.keys(value).find((key) => !KEYS.includes(key as keyof CallScriptReportSettings))
  if (unknown) return fail(unknown, 'réglage inconnu')
  const missing = KEYS.find((key) => value[key] === undefined)
  if (missing) return fail(missing, "valeur manquante (le bloc s'enregistre en entier)")

  if (typeof value.enabled !== 'boolean') return fail('enabled', 'booléen attendu')
  if (typeof value.emailAuthors !== 'boolean') return fail('emailAuthors', 'booléen attendu')
  const int = (key: string, min: number, max: number) =>
    typeof value[key] === 'number' &&
    Number.isInteger(value[key]) &&
    (value[key] as number) >= min &&
    (value[key] as number) <= max
  if (!int('day', 0, 6)) return fail('day', 'entier entre 0 et 6 attendu')
  if (!int('maxInputTokens', ...MAX_INPUT_TOKENS_RANGE))
    return fail('maxInputTokens', `entier entre ${MAX_INPUT_TOKENS_RANGE[0]} et ${MAX_INPUT_TOKENS_RANGE[1]} attendu`)
  if (!int('targetConversionRate', 1, 100)) return fail('targetConversionRate', 'entier entre 1 et 100 attendu')
  if (typeof value.model !== 'string') return fail('model', 'texte attendu')
  const model = value.model.trim()
  if (model && !MODEL_ID.test(model)) return fail('model', 'identifiant de modèle Claude attendu (claude-…)')

  if (!Array.isArray(value.recipients) || !value.recipients.every((v) => typeof v === 'string'))
    return fail('recipients', 'liste d’adresses e-mail attendue')
  const emails = [...new Set(value.recipients.map((v: string) => v.trim().toLowerCase()).filter(Boolean))]
  if (emails.length > RECIPIENTS_MAX) return fail('recipients', `${RECIPIENTS_MAX} destinataires au maximum`)
  const malformed = emails.filter((e) => !SIMPLE_EMAIL.test(e))
  if (malformed.length) return fail('recipients', `adresse invalide : ${malformed.join(', ')}`)
  const domains = allowedDomains()
  const outside = emails.filter((e) => !domains.includes(e.slice(e.lastIndexOf('@') + 1)))
  if (outside.length) {
    const staff = await User.find({ email: { $in: outside }, role: { $in: ADMIN_ROLES }, isActive: true })
      .select('email')
      .lean()
    const known = new Set(staff.map((u) => u.email))
    const rejected = outside.filter((e) => !known.has(e))
    if (rejected.length)
      return fail(
        'recipients',
        `destinataire non autorisé (ni membre actif de l’équipe, ni adresse de l’entreprise) : ${rejected.join(', ')}`,
      )
  }

  return {
    ok: true,
    value: {
      enabled: value.enabled,
      day: value.day as number,
      emailAuthors: value.emailAuthors,
      recipients: emails,
      model,
      maxInputTokens: value.maxInputTokens as number,
      targetConversionRate: value.targetConversionRate as number,
    },
  }
}
