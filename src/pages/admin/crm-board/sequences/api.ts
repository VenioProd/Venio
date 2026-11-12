import { apiFetch } from '../../../../lib/api'
import type {
  EnrollmentsPage,
  EnrollResult,
  Enrollment,
  Sequence,
  SequencePayload,
  SequenceStatus,
  UnenrollResult,
} from './types'

const BASE = '/api/admin/crm/sequences'
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

export const fetchSequences = async (): Promise<{ items: Sequence[]; canAdminister: boolean }> => {
  const res = await apiFetch<{ items?: Sequence[]; canAdminister?: boolean }>(BASE)
  return { items: res.items ?? [], canAdminister: Boolean(res.canAdminister) }
}

export const fetchSequence = (id: string) => apiFetch<Sequence & { canAdminister?: boolean }>(`${BASE}/${id}`)
export const createSequence = (payload: SequencePayload) => apiFetch<Sequence>(BASE, json('POST', payload))
export const updateSequence = (id: string, patch: Partial<SequencePayload> & { status?: SequenceStatus }) =>
  apiFetch<Sequence>(`${BASE}/${id}`, json('PATCH', patch))
export const setSequenceStatus = (id: string, status: SequenceStatus) => updateSequence(id, { status })
export const deleteSequence = (id: string) =>
  apiFetch<{ ok: boolean; deletedId: string }>(`${BASE}/${id}`, json('DELETE'))

export const enrollLeads = (id: string, leadIds: string[]) =>
  apiFetch<EnrollResult>(`${BASE}/${id}/enroll`, json('POST', { leadIds }))
export const unenrollLeads = (id: string, leadIds: string[]) =>
  apiFetch<UnenrollResult>(`${BASE}/${id}/unenroll`, json('POST', { leadIds }))

export function fetchEnrollments(
  id: string,
  params: { status?: string; page?: number; pageSize?: number } = {},
): Promise<EnrollmentsPage> {
  const q = new URLSearchParams()
  if (params.status && params.status !== 'all') q.set('status', params.status)
  q.set('page', String(params.page ?? 1))
  q.set('pageSize', String(params.pageSize ?? 25))
  return apiFetch<EnrollmentsPage>(`${BASE}/${id}/enrollments?${q.toString()}`)
}

export const fetchLeadSequences = async (leadId: string): Promise<Enrollment[]> =>
  (await apiFetch<{ items?: Enrollment[] }>(`/api/admin/crm/leads/${leadId}/sequences`)).items ?? []
