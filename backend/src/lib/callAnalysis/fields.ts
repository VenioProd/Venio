import type { ILead } from '../../types/models/index.js'
import { toRepLead } from '../repLeadView.js'
import { FIELD_KEYS, type FieldKey } from './schema.js'

/**
 * Champs proposables : valeur admise, lecture de la valeur actuelle, et ce
 * qu'un commercial externe a le droit d'accepter (ceux de `repLeadPayload`,
 * plus la qualification).
 */
export const REP_ACCEPTABLE_KEYS: readonly FieldKey[] = [
  'budget',
  'serviceType',
  'contactName',
  'contactEmail',
  'qualification.need',
  'qualification.timeline',
  'qualification.decisionMaker',
  'qualification.objections',
  'qualification.competitors',
]

export type ApplyScope = 'rep' | 'team'

export function acceptableKeys(scope: ApplyScope): readonly FieldKey[] {
  return scope === 'rep' ? REP_ACCEPTABLE_KEYS : FIELD_KEYS
}

const TEXT_LIMITS: Partial<Record<FieldKey, number>> = {
  serviceType: 200,
  sector: 80,
  companySize: 40,
  contactName: 200,
  'qualification.need': 500,
  'qualification.timeline': 300,
  'qualification.decisionMaker': 300,
}
const LIST_LIMITS: Partial<Record<FieldKey, number>> = {
  'qualification.objections': 300,
  'qualification.competitors': 120,
}
const MAX_LIST_ITEMS = 20
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type Coerced = { ok: true; value: number | string | string[] | Date } | { ok: false }

/** Valeur proposée ou saisie, ramenée au type du champ ; refusée si elle n'a pas de sens pour ce champ. */
export function coerceFieldValue(key: FieldKey, value: unknown): Coerced {
  if (value === null || value === undefined) return { ok: false }
  if (key === 'budget') {
    const amount = typeof value === 'number' ? value : Number(String(value).replace(/[\s€]/g, '').replace(',', '.'))
    return Number.isFinite(amount) && amount >= 0 && amount <= 1e9
      ? { ok: true, value: Math.round(amount * 100) / 100 }
      : { ok: false }
  }
  if (key === 'expectedCloseAt') {
    const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim()) : null
    const date = match ? new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`) : null
    return date && !Number.isNaN(date.getTime()) && date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2100
      ? { ok: true, value: date }
      : { ok: false }
  }
  if (key === 'contactEmail') {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
    return EMAIL.test(email) && email.length <= 200 ? { ok: true, value: email } : { ok: false }
  }
  const listLimit = LIST_LIMITS[key]
  if (listLimit) {
    const items = (Array.isArray(value) ? value : [value])
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
    if (items.length === 0 || items.length > MAX_LIST_ITEMS || items.some((item) => item.length > listLimit))
      return { ok: false }
    return { ok: true, value: items }
  }
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
  return text && text.length <= (TEXT_LIMITS[key] ?? 200) ? { ok: true, value: text } : { ok: false }
}

/** Union sans doublon (casse ignorée), pour qu'une liste s'enrichisse d'un appel à l'autre. */
export function mergeList(current: string[], added: string[]): string[] {
  const seen = new Set(current.map((item) => item.toLocaleLowerCase('fr')))
  const merged = [...current]
  for (const item of added) {
    if (seen.has(item.toLocaleLowerCase('fr'))) continue
    seen.add(item.toLocaleLowerCase('fr'))
    merged.push(item)
  }
  return merged.slice(0, MAX_LIST_ITEMS)
}

/** Valeur actuelle d'un champ sur le lead, ou `undefined` si l'appelant ne la voit pas. */
export function currentValue(view: Record<string, unknown>, key: FieldKey): unknown {
  if (key.startsWith('qualification.')) {
    const qualification = (view.qualification ?? {}) as Record<string, unknown>
    const name = key.slice('qualification.'.length)
    return qualification[name] ?? (name === 'objections' || name === 'competitors' ? [] : '')
  }
  return view[key]
}

const QUALIFICATION_DEFAULTS = { need: '', timeline: '', decisionMaker: '', objections: [], competitors: [] }

/**
 * Fiche telle que la voit une personne : la vue de l'externe s'il est le
 * commercial du lead, la fiche de l'équipe sinon. Sert au modèle (il ne reçoit
 * que ce que voit l'auteur) et aux valeurs « actuelles » de l'écran de relecture.
 */
export function leadView(lead: ILead, scope: ApplyScope): Record<string, unknown> {
  if (scope === 'rep') return toRepLead(lead)
  const plain = lead.toObject() as Record<string, unknown>
  return { ...plain, qualification: { ...QUALIFICATION_DEFAULTS, ...((plain.qualification as object) ?? {}) } }
}

const MODEL_CONTEXT_KEYS = [
  'company',
  'contactName',
  'contactEmail',
  'status',
  'budget',
  'serviceType',
  'sector',
  'companySize',
  'expectedCloseAt',
  'leadTemperature',
  'nextActionAt',
  'notes',
  'qualification',
]

/** Fiche envoyée au modèle : les champs utiles à l'analyse, dans la vue de l'auteur. Ni téléphone ni données internes. */
export function modelLeadContext(lead: ILead, scope: ApplyScope): Record<string, unknown> {
  const view = leadView(lead, scope)
  return Object.fromEntries(MODEL_CONTEXT_KEYS.filter((key) => view[key] !== undefined).map((key) => [key, view[key]]))
}
