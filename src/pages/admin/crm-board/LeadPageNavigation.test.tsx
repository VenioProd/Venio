import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import CrmBoard from './index'
import { apiFetch } from '../../../lib/api'

vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'admin', role: 'STAGIAIRE' } }) }))
vi.mock('../../../components/admin/InteractionTimeline', () => ({ default: () => <p>Journal conservé</p> }))
vi.mock('../../../components/admin/RevenueChain', () => ({ default: () => <p>Chaîne conservée</p> }))
const lead = {
  _id: 'a',
  company: 'Atelier',
  status: 'LEAD',
  project: 'ARROW',
  entity: 'ARROW',
  priority: 'HAUTE',
  assignedTo: 'admin',
}
function Location() {
  const location = useLocation()
  return (
    <output aria-label="URL">
      {location.pathname}
      {location.search}
    </output>
  )
}
beforeEach(() => {
  localStorage.setItem('venio.crm.columns.v1', JSON.stringify(['company']))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path === '/api/admin/crm/pipeline')
      return {
        columns: [
          {
            status: 'LEAD',
            leads: [
              ...Array.from({ length: 150 }, (_, index) => ({
                ...lead,
                _id: `other-${index}`,
                company: `Atelier ${index}`,
              })),
              lead,
              ...Array.from({ length: 50 }, (_, index) => ({
                ...lead,
                _id: `last-${index}`,
                company: `Atelier dernier ${index}`,
              })),
            ],
          },
        ],
      }
    if (path === '/api/admin/crm/leads/a') return { lead }
    if (path === '/api/admin/admins') return { users: [{ _id: 'admin', name: 'Admin', role: 'ADMIN' }] }
    if (path === '/api/admin/crm/worklist') return { groups: { overdue: [], today: [], upcoming: [], drifting: [] } }
    return { items: [], tasks: [], quotes: [], projects: [] }
  })
})
it('ouvre la fiche depuis la table et revient avec la vue, les filtres et le défilement', async () => {
  render(
    <MemoryRouter initialEntries={['/admin/crm?mode=liste&project=ARROW&entity=ARROW&q=Atelier&owner=admin']}>
      <Routes>
        <Route path="/admin/crm" element={<CrmBoard />} />
        <Route path="/admin/crm/leads/:leadId" element={<CrmBoard />} />
      </Routes>
      <Location />
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Afficher plus' }))
  const open = screen.getByText('Atelier', { selector: '.rich-co b' }).closest('button')!
  const table = document.querySelector('.rich-table-wrap')!
  table.scrollTop = 180
  table.scrollLeft = 42
  fireEvent.click(open)
  await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent('/admin/crm/leads/a?'))
  expect(await screen.findByRole('heading', { name: 'Atelier' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText('Journal conservé')).toBeInTheDocument()
  expect(document.querySelector('.rich-table')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retour aux leads' }))
  await screen.findByText('Atelier', { selector: '.rich-co b' })
  const url = screen.getByLabelText('URL').textContent!
  for (const filter of ['mode=liste', 'project=ARROW', 'entity=ARROW', 'q=Atelier', 'owner=admin', 'rows=200'])
    expect(url).toContain(filter)
  await waitFor(() => expect(document.querySelector('.rich-table-wrap')?.scrollTop).toBe(180))
  expect(document.querySelector('.rich-table-wrap')?.scrollLeft).toBe(42)
})
