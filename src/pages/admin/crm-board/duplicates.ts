import { apiFetch } from '../../../lib/api'

/** Lead probablement en double, tel que renvoyé par POST /api/admin/crm/check-duplicate. */
export interface DuplicateCandidate {
  _id: string
  company: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  status: string
  archivedAt?: string | null
}

/** Délai d'attente après la dernière frappe avant d'interroger le serveur. */
export const DUPLICATE_DEBOUNCE_MS = 500

export interface DuplicateQuery {
  company?: string
  contactEmail?: string
  contactPhone?: string
  excludeId?: string
}

/** Vrai si la requête porte au moins une valeur à comparer. */
export const hasDuplicateInput = (query: DuplicateQuery): boolean =>
  Boolean(query.company?.trim() || query.contactEmail?.trim() || query.contactPhone?.trim())

/** Doublons probables ; liste vide si la détection est désactivée ou en échec (aide à la saisie : jamais bloquante). */
export async function fetchDuplicates(query: DuplicateQuery): Promise<DuplicateCandidate[]> {
  try {
    const res = await apiFetch<{ duplicates?: DuplicateCandidate[] }>('/api/admin/crm/check-duplicate', {
      method: 'POST',
      body: JSON.stringify(query),
    })
    return Array.isArray(res?.duplicates) ? res.duplicates : []
  } catch {
    return []
  }
}
