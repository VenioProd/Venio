const STATUSES = ['EN_COURS', 'EN_ATTENTE', 'TERMINE']
const PRIORITIES = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']
const SORTS = ['urgency', 'dueDate', 'budget', 'name']

export interface ViewFilters {
  status: string
  assignedTo: string
  priority: string
  risk: boolean
  late: boolean
  toBill: boolean
  mine: boolean
  q: string
  sort: string
}

/** Ne garde que les filtres connus, avec des valeurs valides : une vue ne peut pas contenir autre chose. */
export function sanitizeViewFilters(raw: unknown): ViewFilters {
  const f = (raw ?? {}) as Record<string, unknown>
  const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.slice(0, max) : '')
  return {
    status: STATUSES.includes(str(f.status)) ? str(f.status) : '',
    assignedTo: /^[a-f\d]{24}$/i.test(str(f.assignedTo)) ? str(f.assignedTo) : '',
    priority: PRIORITIES.includes(str(f.priority)) ? str(f.priority) : '',
    risk: f.risk === true,
    late: f.late === true,
    toBill: f.toBill === true,
    mine: f.mine === true,
    q: str(f.q).trim(),
    sort: SORTS.includes(str(f.sort)) ? str(f.sort) : 'urgency',
  }
}

export function sanitizeViewName(raw: unknown): string | null {
  const name = typeof raw === 'string' ? raw.trim() : ''
  return name.length >= 1 && name.length <= 60 ? name : null
}
