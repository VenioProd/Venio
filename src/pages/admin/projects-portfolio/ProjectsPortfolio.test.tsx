import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ProjectsPortfolio from './ProjectsPortfolio'
import { apiFetch } from '../../../lib/api'
import type { PortfolioItem, PortfolioOverview } from './portfolio'

vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', role: 'SUPER_ADMIN' } }) }))
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

const item = (o: Partial<PortfolioItem>): PortfolioItem => ({
  _id: 'p1',
  name: 'Refonte Lumen',
  projectNumber: '',
  status: 'EN_COURS',
  priority: 'NORMALE',
  client: { _id: 'c', name: 'Lumen Studio' },
  assignedTo: { _id: 'u1', name: 'Camille Martin' },
  endDate: '2026-10-20',
  budget: { amount: 18000, invoiced: 20160, currency: 'EUR' },
  tasks: { total: 10, done: 6 },
  progress: 60,
  expectedProgress: null,
  daysToDue: -12,
  overdueDays: 12,
  budgetPct: 112,
  staleDays: 0,
  risks: [{ code: 'LATE', value: 12 }],
  urgency: 112,
  actions: ['POSTPONE', 'REASSIGN'],
  ...o,
})
const lumen = item({})
const boreal = item({
  _id: 'p2',
  name: 'Extranet Boréal',
  overdueDays: 0,
  daysToDue: 30,
  risks: [],
  urgency: 0,
  actions: [],
  budgetPct: 66,
})
const overview: PortfolioOverview = {
  pulse: {
    total: 2,
    active: 2,
    done: 0,
    late: 1,
    atRisk: 1,
    dueIn7Days: 0,
    dueIn48h: 0,
    toBill: 0,
    budget: { total: 18000, invoiced: 20160, pct: 112 },
    load: { pct: 87, overloaded: 0 },
  },
  queue: [lumen],
  upcoming: [],
  workload: [],
  items: [lumen, boreal],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiFetch).mockImplementation(async (path, options) => {
    if (path === '/api/admin/projects/overview') return overview
    if (path === '/api/admin/projects/views') return { views: [] }
    if (path === '/api/admin/admins') return { users: [{ _id: 'u1', name: 'Camille Martin' }] }
    if (path === '/api/admin/projects/bulk')
      return { succeeded: 1, failed: 0, results: [{ id: 'p2', ok: true }], echo: options }
    throw new Error(`Unexpected ${path}`)
  })
})

const renderIt = () =>
  render(
    <MemoryRouter>
      <ProjectsPortfolio />
    </MemoryRouter>,
  )

describe('ProjectsPortfolio', () => {
  it('affiche la file À traiter et les indicateurs', async () => {
    renderIt()
    expect(await screen.findByText('1 en retard')).toBeInTheDocument()
    expect(screen.getByText('12 j de retard')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Décaler l’échéance' })).toBeInTheDocument()
  })

  it('filtre par vue « En retard »', async () => {
    renderIt()
    await screen.findByText('Extranet Boréal')
    fireEvent.click(screen.getByRole('button', { name: /En retard/ }))
    expect(screen.queryByText('Extranet Boréal')).not.toBeInTheDocument()
  })

  it('archive en masse les projets cochés', async () => {
    renderIt()
    fireEvent.click(await screen.findByLabelText('Sélectionner Extranet Boréal'))
    expect(screen.getByText('1 sélectionné(s)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/admin/projects/bulk',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'archive', ids: ['p2'] }) }),
      ),
    )
  })
})
