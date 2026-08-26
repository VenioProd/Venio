import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as api from '../../lib/api'
import * as changeRequests from '../../services/changeRequests'
import ClientDashboard from './Dashboard'

vi.mock('../../services/changeRequests')
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../../lib/api')
  return { ...actual, apiFetch: vi.fn() }
})
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', name: 'Claire Corbel', role: 'CLIENT' } }),
}))

function makeRequest(overrides: Record<string, unknown>) {
  return {
    _id: 'cr1',
    title: 'Module de réservation',
    description: '',
    pageUrl: '',
    priority: 'NORMALE',
    status: 'EN_COURS',
    qualification: null,
    refusalReason: '',
    client: 'u1',
    createdBy: 'u1',
    createdByName: 'Claire Corbel',
    project: null,
    replies: [],
    statusHistory: [],
    deliveredAt: null,
    validatedAt: null,
    createdAt: '2026-08-14T09:00:00.000Z',
    updatedAt: '2026-08-14T09:00:00.000Z',
    ...overrides,
  }
}

function mockList(list: ReturnType<typeof makeRequest>[]) {
  vi.mocked(changeRequests.listChangeRequests).mockResolvedValue({ changeRequests: list } as unknown as Awaited<
    ReturnType<typeof changeRequests.listChangeRequests>
  >)
}

beforeEach(() => {
  vi.mocked(api.apiFetch).mockImplementation((path: string) => {
    if (path === '/api/projects') return Promise.resolve({ projects: [] })
    return Promise.resolve({ progress: {} })
  })
})

describe('section « Vos demandes en cours »', () => {
  it('liste jusqu’à trois demandes actives', async () => {
    mockList([
      makeRequest({ _id: 'a', title: 'Demande A' }),
      makeRequest({ _id: 'b', title: 'Demande B', status: 'LIVREE' }),
      makeRequest({ _id: 'c', title: 'Demande C', status: 'SOUMISE' }),
      makeRequest({ _id: 'd', title: 'Demande D', status: 'PLANIFIEE' }),
      makeRequest({ _id: 'e', title: 'Demande terminée', status: 'VALIDEE' }),
    ])

    render(
      <MemoryRouter>
        <ClientDashboard />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Vos demandes en cours')).toBeInTheDocument()
    expect(screen.getByText('Demande A')).toBeInTheDocument()
    expect(screen.getByText('Demande C')).toBeInTheDocument()
    expect(screen.queryByText('Demande D')).not.toBeInTheDocument()
    expect(screen.queryByText('Demande terminée')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /toutes vos demandes/i })).toHaveAttribute(
      'href',
      '/espace-client/demandes',
    )
  })

  it('masque la section quand le compte n’a aucune demande', async () => {
    mockList([])

    render(
      <MemoryRouter>
        <ClientDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Mes projets')).toBeInTheDocument())
    expect(screen.queryByText('Vos demandes en cours')).not.toBeInTheDocument()
  })

  it('n’empêche pas le rendu si l’appel échoue', async () => {
    vi.mocked(changeRequests.listChangeRequests).mockRejectedValue(new Error('boom'))

    render(
      <MemoryRouter>
        <ClientDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Mes projets')).toBeInTheDocument())
    expect(screen.queryByText('Vos demandes en cours')).not.toBeInTheDocument()
  })
})
