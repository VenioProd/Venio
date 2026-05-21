import { makeShortId } from '../../../models/education/sessionWorkspace.js'

/**
 * VENIO-44 — Normalisateurs des sous-collections de "workspace"
 * (notes/remarques/liens/rappels/devoirs) partagés entre les routes des
 * séances internes (`/sessions/:id/workspace`) et des fiches d'événements
 * Apple Calendar (`/calendar/workspace/...`).
 *
 * On préserve les ids existants côté client (au format string court) et on
 * en régénère si manquant. Les entrées vides (texte/label/url tous vides)
 * sont silencieusement filtrées pour éviter des lignes fantômes pendant
 * l'autosauvegarde.
 */

function parseDate(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

export function normalizeRemarks(input: unknown[]): { id: string; text: string; createdAt: Date }[] {
  return input
    .map((r) => {
      const row = (r ?? {}) as Record<string, unknown>
      const text = typeof row.text === 'string' ? row.text.trim() : ''
      if (!text) return null
      const createdAt = parseDate(row.createdAt) ?? new Date()
      return {
        id: typeof row.id === 'string' && row.id ? row.id : makeShortId(),
        text,
        createdAt,
      }
    })
    .filter((r): r is { id: string; text: string; createdAt: Date } => Boolean(r))
}

export function normalizeLinks(input: unknown[]): { id: string; label: string; url: string }[] {
  return input
    .map((r) => {
      const row = (r ?? {}) as Record<string, unknown>
      const url = typeof row.url === 'string' ? row.url.trim() : ''
      const label = typeof row.label === 'string' ? row.label.trim() : ''
      if (!url && !label) return null
      return {
        id: typeof row.id === 'string' && row.id ? row.id : makeShortId(),
        label,
        url,
      }
    })
    .filter((r): r is { id: string; label: string; url: string } => Boolean(r))
}

export function normalizeReminders(
  input: unknown[],
): { id: string; label: string; dueAt: Date | null; done: boolean }[] {
  return input
    .map((r) => {
      const row = (r ?? {}) as Record<string, unknown>
      const label = typeof row.label === 'string' ? row.label.trim() : ''
      if (!label) return null
      return {
        id: typeof row.id === 'string' && row.id ? row.id : makeShortId(),
        label,
        dueAt: parseDate(row.dueAt),
        done: Boolean(row.done),
      }
    })
    .filter((r): r is { id: string; label: string; dueAt: Date | null; done: boolean } => Boolean(r))
}

export function normalizeDuties(
  input: unknown[],
): { id: string; label: string; dueAt: Date | null; done: boolean }[] {
  return normalizeReminders(input)
}
