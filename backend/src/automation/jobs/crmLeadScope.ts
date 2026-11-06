// ─────────────────────────────────────────────────────────────
// Filtre commun des automatisations CRM : un lead archivé ou dont les
// automatisations sont suspendues ne doit jamais être traité.
// `null` en Mongo correspond aussi aux champs absents.
// ─────────────────────────────────────────────────────────────

export const ACTIVE_LEAD_FILTER = Object.freeze({
  archivedAt: null,
  automationPausedAt: null,
})

/** Retourne une copie du filtre avec l'exclusion des leads archivés / en pause. */
export function withActiveLeads<T extends Record<string, unknown>>(
  filter: T,
): Omit<T, 'archivedAt' | 'automationPausedAt'> & { archivedAt: null; automationPausedAt: null } {
  return { ...filter, archivedAt: null, automationPausedAt: null }
}

/** Vrai si le lead (document ou objet) est archivé ou en pause d'automatisation. */
export function isLeadExcludedFromAutomation(
  lead: { archivedAt?: Date | null; automationPausedAt?: Date | null } | null | undefined,
): boolean {
  return !!lead && (lead.archivedAt != null || lead.automationPausedAt != null)
}
