import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import CrmBoard from './index'
import { apiFetch } from '../../../lib/api'
import LeadEnrichedPanel from './rich/LeadEnrichedPanel'
import type { Lead } from '../../../types/crm.types'

vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'admin', role: 'SUPER_ADMIN' } }) }))
vi.mock('./LeadDetailPage', () => ({
  default: ({
    lead,
    onUpdateLead,
    onLeadChange,
  }: {
    lead: Lead
    onUpdateLead: (id: string, patch: Record<string, unknown>) => Promise<void>
    onLeadChange: (updater: (previous: Lead | null) => Lead | null) => void
  }) => (
    <div role="dialog">
      <span>{lead.company}</span>
      <button onClick={() => onUpdateLead(lead._id, { company: 'Après' })}>Modifier</button>
      <LeadEnrichedPanel
        lead={lead}
        canManageCrm
        onUpdateLead={onUpdateLead}
        onLocalChange={(patch) => onLeadChange((previous) => (previous ? { ...previous, ...patch } : previous))}
      />
    </div>
  ),
}))

beforeEach(() => vi.clearAllMocks())

it('affiche le PATCH avant sa réponse et revient en arrière sur erreur dans la fiche en page', async () => {
  let resolvePatch!: (result: unknown) => void
  let rejectPatch!: (error: Error) => void
  vi.mocked(apiFetch).mockImplementation(async (path, options) => {
    if (options?.method === 'PATCH')
      return new Promise((resolve, reject) => {
        resolvePatch = resolve
        rejectPatch = reject
      })
    if (path === '/api/admin/crm/pipeline')
      return { columns: [{ status: 'LEAD', leads: [{ _id: 'a', company: 'Avant', status: 'LEAD' }] }] }
    if (path === '/api/admin/crm/leads/a') return { lead: { _id: 'a', company: 'Avant', status: 'LEAD' } }
    if (path === '/api/admin/admins') return { users: [] }
    if (path === '/api/admin/crm/worklist') return { groups: { overdue: [], today: [], upcoming: [], drifting: [] } }
    return { items: [] }
  })
  render(
    <MemoryRouter initialEntries={['/admin/crm/leads/a']}>
      <Routes>
        <Route path="/admin/crm/leads/:leadId" element={<CrmBoard />} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
  expect(screen.getAllByText('Après')).toHaveLength(1)
  expect(screen.queryByText('Chargement du pipeline…')).not.toBeInTheDocument()
  resolvePatch({ lead: { _id: 'a', company: 'Confirmé', status: 'LEAD' } })
  await waitFor(() => expect(screen.getAllByText('Confirmé')).toHaveLength(1))
  fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
  expect(screen.getAllByText('Après')).toHaveLength(1)
  rejectPatch(new Error('Échec du PATCH'))
  await waitFor(() => expect(screen.getAllByText('Confirmé')).toHaveLength(1))
  expect(screen.getByRole('alert')).toHaveTextContent('Échec du PATCH')
  const sector = screen.getByLabelText('Secteur')
  fireEvent.change(sector, { target: { value: 'Industrie' } })
  fireEvent.blur(sector)
  rejectPatch(new Error('Échec du secteur'))
  await waitFor(() => expect(screen.getByLabelText('Secteur')).toHaveValue(''))
  expect(vi.mocked(apiFetch).mock.calls.filter(([path]) => path === '/api/admin/crm/pipeline')).toHaveLength(1)
})
