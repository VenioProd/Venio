import { apiFetch } from '../lib/api'
import type { MessageKey } from '../i18n'
import { formatDate, formatMoney } from '../i18n/format'

export type RepLeadStatus = 'LEAD' | 'QUALIFIED' | 'CONTACTED' | 'DEMO' | 'PROPOSAL' | 'WON' | 'LOST'

export interface RepLead {
  _id: string
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string
  source: string
  status: RepLeadStatus
  priority: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
  budget: number | null
  nextActionAt: string | null
  lastContactAt: string | null
  notes: string
  serviceType: string
  leadTemperature: 'FROID' | 'TIEDE' | 'CHAUD' | 'TRES_CHAUD'
  lostReason: string
  lostComment: string
  handedOffAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RepActivity {
  _id: string
  type: string
  label: string
  status: RepLeadStatus | null
  actorName: string | null
  createdAt: string
}

export interface RepInteraction {
  _id: string
  kind: 'EMAIL' | 'CALL' | 'MEETING' | 'NOTE'
  direction: 'OUT' | 'IN' | 'NONE'
  occurredAt: string
  subject: string
  body: string
}

export interface RepClient {
  _id: string
  name: string
  companyName?: string
  email: string
  phone?: string
  signedAt: string
  lead: { _id: string; company: string }
  collectedHtCents: number
  commissionCents: number
}

export interface CommissionTotals {
  collectedHtCents: number
  dueCents: number
  paidCents: number
}

export interface RepCommission {
  _id: string
  kind: 'PAYMENT' | 'REFUND'
  invoiceNumber: string
  clientName: string
  baseHtCents: number
  rateBp: number
  amountCents: number
  receivedAt: string
  status: 'DUE' | 'PAID'
  paidAt: string | null
}

/** Ce que l'externe a le droit de saisir sur une fiche. */
export type RepLeadInput = Partial<
  Pick<
    RepLead,
    | 'company'
    | 'contactName'
    | 'contactEmail'
    | 'contactPhone'
    | 'source'
    | 'status'
    | 'priority'
    | 'budget'
    | 'nextActionAt'
    | 'notes'
    | 'serviceType'
    | 'leadTemperature'
    | 'lostReason'
    | 'lostComment'
  >
>

// Statuts que l'externe peut choisir : la proposition et la signature reviennent au closer.
export const REP_EDITABLE_STATUSES: RepLeadStatus[] = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'LOST']

export const STATUS_LABEL_KEYS: Record<RepLeadStatus, MessageKey> = {
  LEAD: 'crm.status.lead',
  QUALIFIED: 'crm.status.qualified',
  CONTACTED: 'crm.status.contacted',
  DEMO: 'crm.status.demo',
  PROPOSAL: 'crm.status.proposal',
  WON: 'crm.status.won',
  LOST: 'crm.status.lost',
}

export function formatCents(cents: number): string {
  return formatMoney(cents / 100)
}

export function formatDay(value: string | null | undefined): string {
  return formatDate(value) || '—'
}

const json = (body: unknown) => ({ body: JSON.stringify(body) })

export const commercialApi = {
  leads: (params: { search?: string; status?: string } = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value) as [string, string][])
    return apiFetch<{ leads: RepLead[] }>(`/api/commercial/leads${query.size ? `?${query}` : ''}`)
  },
  lead: (id: string) =>
    apiFetch<{ lead: RepLead; activities: RepActivity[]; interactions: RepInteraction[] }>(
      `/api/commercial/leads/${id}`,
    ),
  createLead: (input: RepLeadInput) =>
    apiFetch<{ lead: RepLead }>('/api/commercial/leads', { method: 'POST', ...json(input) }),
  updateLead: (id: string, input: RepLeadInput) =>
    apiFetch<{ lead: RepLead }>(`/api/commercial/leads/${id}`, { method: 'PATCH', ...json(input) }),
  logInteraction: (id: string, input: Pick<RepInteraction, 'kind' | 'subject' | 'body'> & { occurredAt?: string }) =>
    apiFetch<{ interaction: RepInteraction }>(`/api/commercial/leads/${id}/interactions`, {
      method: 'POST',
      ...json(input),
    }),
  readyToClose: (id: string, message: string) =>
    apiFetch<{ lead: RepLead }>(`/api/commercial/leads/${id}/ready-to-close`, { method: 'POST', ...json({ message }) }),
  clients: () => apiFetch<{ clients: RepClient[] }>('/api/commercial/clients'),
  commissions: () =>
    apiFetch<{ rateBp: number; totals: CommissionTotals; commissions: RepCommission[] }>('/api/commercial/commissions'),
}

// ─── Pilotage côté équipe ───────────────────────────────────────────────────

export interface ExternalRepRow extends CommissionTotals {
  _id: string
  name: string
  email: string
  isActive: boolean
  lastLoginAt?: string | null
  leads: number
  handedOff: number
  won: number
  lost: number
  conversionRate: number
}

export interface ExternalRepLead {
  _id: string
  company: string
  contactName: string
  status: RepLeadStatus
  closingHandoff: { at: string } | null
  assignedTo: { _id: string; name: string } | null
  updatedAt: string
}

export interface ExternalRepCommission {
  _id: string
  kind: 'PAYMENT' | 'REFUND'
  invoice: { number: string } | null
  client: { name: string; companyName?: string } | null
  baseHtCents: number
  amountCents: number
  receivedAt: string
  status: 'DUE' | 'PAID'
  paidAt: string | null
  paidBy: { name: string } | null
}

export interface ExternalRepActivity {
  _id: string
  type: string
  label: string
  actorId: { name: string } | null
  leadId: { _id: string; company: string } | null
  createdAt: string
}

export const externalSalesAdminApi = {
  reps: () => apiFetch<{ rateBp: number; reps: ExternalRepRow[] }>('/api/admin/external-sales/reps'),
  rep: (id: string) =>
    apiFetch<{
      rep: { _id: string; name: string; email: string; isActive: boolean }
      leads: ExternalRepLead[]
      commissions: ExternalRepCommission[]
      totals: CommissionTotals
    }>(`/api/admin/external-sales/reps/${id}`),
  activity: (id: string) =>
    apiFetch<{ activities: ExternalRepActivity[] }>(`/api/admin/external-sales/reps/${id}/activity`),
  reassign: (input: { leadIds?: string[]; fromRep?: string; toRep: string | null }) =>
    apiFetch<{ moved: number }>('/api/admin/external-sales/reassign', { method: 'POST', ...json(input) }),
  markPaid: (input: { ids?: string[]; rep?: string }) =>
    apiFetch<{ paid: number }>('/api/admin/external-sales/commissions/mark-paid', { method: 'POST', ...json(input) }),
}
