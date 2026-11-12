import mongoose from 'mongoose'
import type { UserRole } from '../types/enums.js'
import { ADMIN_ROLES, isAdminRole } from './permissions.js'
import { entityCondition, isGroupEntity } from './groupEntities.js'
import Lead from '../models/Lead.js'
import {
  HISTORY_LIMIT,
  PROJECT_SHEET_SECTIONS,
  type IProjectSheetHistory,
  type ProjectSheetSection,
} from '../models/ProjectSheet.js'

/**
 * Règles et sérialisation des fiches projets (voir models/ProjectSheet.ts).
 *
 *  - lecture : tout membre interne ayant accès à l'admin (rôles admin) ;
 *  - écriture : SUPER_ADMIN et ADMIN ;
 *  - révélation d'un mot de passe d'accès démo : rôles admin (jamais CLIENT,
 *    COMMERCIAL_EXTERNE ni AGENT), journalisée.
 *
 * Le mot de passe chiffré n'apparaît dans aucune réponse : la sérialisation
 * procède par liste blanche et ne garde qu'un drapeau `hasPassword`.
 */

export const SHEET_EDITOR_ROLES: readonly UserRole[] = ['SUPER_ADMIN', 'ADMIN']

export function canReadSheets(role: unknown): boolean {
  return typeof role === 'string' && isAdminRole(role as UserRole)
}
export function canEditSheets(role: unknown): boolean {
  return typeof role === 'string' && SHEET_EDITOR_ROLES.includes(role as UserRole)
}
export function canRevealDemoAccess(role: unknown): boolean {
  return canReadSheets(role)
}

export function isSectionKey(key: string): key is ProjectSheetSection {
  return (PROJECT_SHEET_SECTIONS as readonly string[]).includes(key)
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)
}

export class SheetInputError extends Error {
  status = 400
  constructor(message: string) {
    super(message)
  }
}

const SCALAR_FIELDS = [
  'name',
  'logoUrl',
  'accentColor',
  'status',
  'reviewStatus',
  'legalEntity',
  'leadProject',
  'oneLiner',
  ...PROJECT_SHEET_SECTIONS,
] as const

/** Champs modifiables par l'API d'écriture (ni slug, ni accès démo, ni historique). */
export const SHEET_WRITABLE_FIELDS = [
  ...SCALAR_FIELDS,
  'archived',
  'websites',
  'links',
  'referent',
  'team',
  'devProject',
  'subsidiary',
] as const

function str(value: unknown, field: string): string {
  if (value === null) return ''
  if (typeof value !== 'string') throw new SheetInputError(`Champ « ${field} » : texte attendu.`)
  return value
}
function list(value: unknown, field: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object'))
    throw new SheetInputError(`Champ « ${field} » : liste attendue.`)
  return value as Record<string, unknown>[]
}
function objectIdOrNull(value: unknown, field: string): mongoose.Types.ObjectId | null {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value))
    throw new SheetInputError(`Champ « ${field} » : identifiant invalide.`)
  return new mongoose.Types.ObjectId(value)
}

/**
 * Extrait d'un corps de requête les seuls champs autorisés, typés.
 * Les valeurs (enum, longueurs, URL) sont ensuite validées par le schéma.
 */
export function pickSheetInput(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {}
  const input = body as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of SCALAR_FIELDS) if (input[key] !== undefined) out[key] = str(input[key], key)
  if (input.archived !== undefined) {
    if (typeof input.archived !== 'boolean') throw new SheetInputError('Champ « archived » : booléen attendu.')
    out.archived = input.archived
  }
  if (input.websites !== undefined)
    out.websites = list(input.websites, 'websites').map((w) => ({
      label: str(w.label ?? '', 'websites.label'),
      url: str(w.url ?? '', 'websites.url'),
    }))
  if (input.links !== undefined)
    out.links = list(input.links, 'links').map((l) => ({
      type: str(l.type ?? 'other', 'links.type') || 'other',
      label: str(l.label ?? '', 'links.label'),
      url: str(l.url ?? '', 'links.url'),
    }))
  if (input.team !== undefined)
    out.team = list(input.team, 'team').map((m) => ({
      user: objectIdOrNull(
        typeof m.user === 'object' && m.user ? (m.user as { _id?: unknown })._id : m.user,
        'team.user',
      ),
      role: str(m.role ?? '', 'team.role'),
    }))
  for (const key of ['referent', 'devProject', 'subsidiary'] as const)
    if (input[key] !== undefined) out[key] = objectIdOrNull(input[key], key)
  if (out.name !== undefined && !String(out.name).trim()) throw new SheetInputError('Le nom est requis.')
  if (Array.isArray(out.team) && out.team.some((m) => !(m as { user: unknown }).user))
    throw new SheetInputError('Chaque membre de l’équipe doit être un utilisateur.')
  return out
}

/** Champs dont la valeur change réellement (comparaison JSON). */
export function changedFields(before: Record<string, unknown>, updates: Record<string, unknown>): string[] {
  const norm = (v: unknown) => JSON.stringify(v ?? null)
  return Object.keys(updates).filter((key) => norm(before[key]) !== norm(updates[key]))
}

export function historyEntry(by: unknown, fields: string[], summary: string): IProjectSheetHistory {
  return {
    at: new Date(),
    by: by && mongoose.isValidObjectId(by) ? new mongoose.Types.ObjectId(String(by)) : null,
    fields,
    summary,
  }
}

/** Ajoute une entrée et ne conserve que les HISTORY_LIMIT plus récentes. */
export function pushHistory(history: IProjectSheetHistory[], entry: IProjectSheetHistory): void {
  history.push(entry)
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT)
}

export const DEMO_ACCESS_HISTORY_SUMMARY = 'accès démo modifié'

// ── Sérialisation ─────────────────────────────────────────────────────────────

type Lean = Record<string, any>

function person(value: unknown, fields: string[]) {
  if (!value || typeof value !== 'object' || !('_id' in value)) return null
  const v = value as Lean
  return Object.fromEntries([['_id', v._id], ...fields.map((f) => [f, v[f] ?? ''])])
}

/** Accès démo exposables : jamais le mot de passe, seulement `hasPassword`. */
export function publicDemoAccesses(accesses: unknown): Lean[] {
  if (!Array.isArray(accesses)) return []
  return accesses.map((a: Lean) => ({
    _id: a._id,
    url: a.url ?? '',
    role: a.role ?? '',
    username: a.username ?? '',
    notes: a.notes ?? '',
    hasPassword: Boolean(a.passwordEnc) || a.hasPassword === true,
    updatedAt: a.updatedAt ?? null,
  }))
}

export interface SheetViewer {
  role: string
}

/** Fiche complète pour la page de détail (liste blanche de champs). */
export function serializeSheet(sheet: Lean, viewer: SheetViewer, extra: Lean = {}): Lean {
  const sections = Object.fromEntries(PROJECT_SHEET_SECTIONS.map((key) => [key, sheet[key] ?? '']))
  const devProject = person(sheet.devProject, ['key', 'name'])
  return {
    _id: sheet._id,
    slug: sheet.slug,
    name: sheet.name,
    logoUrl: sheet.logoUrl ?? '',
    accentColor: sheet.accentColor ?? '',
    status: sheet.status,
    reviewStatus: sheet.reviewStatus,
    archived: Boolean(sheet.archived),
    oneLiner: sheet.oneLiner ?? '',
    websites: (sheet.websites ?? []).map((w: Lean) => ({ label: w.label ?? '', url: w.url ?? '' })),
    legalEntity: sheet.legalEntity ?? '',
    leadProject: sheet.leadProject ?? '',
    links: (sheet.links ?? []).map((l: Lean) => ({ type: l.type, label: l.label, url: l.url })),
    referent: person(sheet.referent, ['name', 'email']),
    team: (sheet.team ?? [])
      .map((m: Lean) => ({ user: person(m.user, ['name', 'email', 'role']), role: m.role ?? '' }))
      .filter((m: Lean) => m.user),
    devProject: devProject ? { ...devProject, href: `/admin/dev?project=${devProject._id}` } : null,
    subsidiaryHref:
      viewer.role === 'SUPER_ADMIN' && sheet.subsidiary
        ? `/admin/filiales/${String(sheet.subsidiary._id ?? sheet.subsidiary)}`
        : null,
    ...sections,
    demoAccesses: publicDemoAccesses(sheet.demoAccesses),
    history: [...(sheet.history ?? [])]
      .reverse()
      .slice(0, 50)
      .map((h: Lean) => ({ at: h.at, by: person(h.by, ['name']), fields: h.fields ?? [], summary: h.summary ?? '' })),
    canEdit: canEditSheets(viewer.role),
    canReveal: canRevealDemoAccess(viewer.role),
    createdAt: sheet.createdAt,
    updatedAt: sheet.updatedAt,
    ...extra,
  }
}

/** Carte de la liste. */
export function serializeSheetCard(sheet: Lean): Lean {
  return {
    _id: sheet._id,
    slug: sheet.slug,
    name: sheet.name,
    logoUrl: sheet.logoUrl ?? '',
    accentColor: sheet.accentColor ?? '',
    status: sheet.status,
    reviewStatus: sheet.reviewStatus,
    archived: Boolean(sheet.archived),
    oneLiner: sheet.oneLiner ?? '',
    legalEntity: sheet.legalEntity ?? '',
    referent: person(sheet.referent, ['name']),
    updatedAt: sheet.updatedAt,
  }
}

// ── Recherche plein texte ─────────────────────────────────────────────────────

/** Champs interrogés. Les accès démo et l'historique en sont exclus. */
export const SEARCHABLE_FIELDS = ['name', 'oneLiner', ...PROJECT_SHEET_SECTIONS, 'websites', 'links'] as const

/** Minuscule sans accent, caractère par caractère (les positions restent alignées). */
function fold(input: string): string {
  let out = ''
  for (const ch of input) {
    const base = ch
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    out += base.length === ch.length ? base : ch.toLowerCase().length === ch.length ? ch.toLowerCase() : ch
  }
  return out
}

function fieldText(sheet: Lean, field: string): string {
  if (field === 'websites') return (sheet.websites ?? []).map((w: Lean) => `${w.label} ${w.url}`).join(' · ')
  if (field === 'links') return (sheet.links ?? []).map((l: Lean) => `${l.label} ${l.url}`).join(' · ')
  return typeof sheet[field] === 'string' ? sheet[field] : ''
}

function excerpt(source: string, at: number, length: number): string {
  // `source` a déjà ses espaces fusionnés : les positions de `fold` y restent alignées.
  const plain = source
  const start = Math.max(0, at - 60)
  const end = Math.min(plain.length, at + length + 80)
  const cut = plain
    .slice(start, end)
    .replace(/[#*_`>|]/g, '')
    .trim()
  return (start > 0 ? '… ' : '') + cut + (end < plain.length ? ' …' : '')
}

export interface SheetSearchMatch {
  field: string
  excerpt: string
}

/**
 * Filtre et classe des fiches selon une requête : chaque mot doit apparaître
 * dans au moins un champ de la fiche (insensible à la casse et aux accents).
 * Renvoie, par fiche retenue, jusqu'à trois extraits.
 */
export function searchSheets<T extends Lean>(
  sheets: T[],
  query: string,
): Array<{ sheet: T; matches: SheetSearchMatch[] }> {
  const terms = fold(query)
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .slice(0, 8)
  if (!terms.length) return sheets.map((sheet) => ({ sheet, matches: [] }))
  const results: Array<{ sheet: T; matches: SheetSearchMatch[]; score: number }> = []
  for (const sheet of sheets) {
    const texts = SEARCHABLE_FIELDS.map((field) => {
      const raw = fieldText(sheet, field).replace(/\s+/g, ' ')
      return { field, raw, folded: fold(raw) }
    })
    if (!terms.every((term) => texts.some((t) => t.folded.includes(term)))) continue
    const matches: SheetSearchMatch[] = []
    let score = 0
    for (const t of texts) {
      const hit = terms.map((term) => ({ term, at: t.folded.indexOf(term) })).find((h) => h.at >= 0)
      if (!hit) continue
      score += t.field === 'name' ? 10 : t.field === 'oneLiner' ? 3 : 1
      if (matches.length < 3) matches.push({ field: t.field, excerpt: excerpt(t.raw, hit.at, hit.term.length) })
    }
    results.push({ sheet, matches, score })
  }
  results.sort((a, b) => b.score - a.score || String(a.sheet.name).localeCompare(String(b.sheet.name), 'fr'))
  return results.map(({ sheet, matches }) => ({ sheet, matches }))
}

// ── Liens vers les données existantes ────────────────────────────────────────

/** Leads du CRM correspondant à la fiche (entité du groupe, et projet si renseigné). */
export async function sheetCrmSummary(legalEntity: unknown, leadProject: unknown) {
  const entity = isGroupEntity(legalEntity) ? legalEntity : ''
  const project = typeof leadProject === 'string' ? leadProject : ''
  if (!entity && !project) return null
  const filter: Record<string, unknown> = { archivedAt: null }
  if (entity) filter.entity = entityCondition([entity])
  if (project) filter.project = project
  const [openLeads, wonLeads] = await Promise.all([
    Lead.countDocuments({ ...filter, status: { $nin: ['WON', 'LOST'] } }),
    Lead.countDocuments({ ...filter, status: 'WON' }),
  ])
  const params = new URLSearchParams()
  if (entity) params.set('entity', entity)
  if (project) params.set('project', project)
  return { entity, leadProject: project, openLeads, wonLeads, href: `/admin/crm?${params.toString()}` }
}

export { ADMIN_ROLES }
