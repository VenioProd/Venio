import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClientDashboard from './Dashboard'
import { apiFetch } from '../../lib/api'
import * as clientVaultService from '../../services/clientVault'
import { useAuth } from '../../context/AuthContext'

vi.mock('../../services/clientVault')
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return { ...actual, apiFetch: vi.fn() }
})
vi.mock('../../context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../context/AuthContext')>('../../context/AuthContext')
  return { ...actual, useAuth: vi.fn() }
})

function renderDashboard() {
  return render(
    <MemoryRouter>
      <ClientDashboard />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 'u1', name: 'Client Test', email: 'c@test.fr', role: 'CLIENT' } as never,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  } as never)
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path === '/api/projects') return Promise.resolve({ projects: [] })
    if (path === '/api/projects/task-progress-all') return Promise.resolve({ progress: {} })
    return Promise.resolve({})
  })
})

describe('Dashboard — bloc À faire', () => {
  it('masque le bloc quand action-items est vide', async () => {
    vi.mocked(clientVaultService.listClientActionItems).mockResolvedValue({ items: [] })
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Mes projets')).toBeInTheDocument())
    expect(screen.queryByText(/À faire/)).not.toBeInTheDocument()
  })

  it('rend les deux types émis dans ce lot', async () => {
    vi.mocked(clientVaultService.listClientActionItems).mockResolvedValue({
      items: [
        {
          type: 'DEVIS_A_SIGNER',
          title: 'Proposition « Refonte » à signer',
          detail: '',
          project: { id: 'p1', name: 'Refonte' },
          link: '/espace-client/projets/p1/propositions/1',
          dueAt: '2026-09-12T00:00:00.000Z',
          amount: 4800,
          createdAt: '2026-08-01T00:00:00.000Z',
        },
        {
          type: 'FACTURE_A_PAYER',
          title: 'Facture FAC-002 à régler',
          detail: '',
          project: { id: 'p1', name: 'Refonte' },
          link: '/espace-client/projets/p1/facturation',
          dueAt: null,
          amount: 1200,
          createdAt: '2026-08-02T00:00:00.000Z',
        },
      ],
    })
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Proposition « Refonte » à signer')).toBeInTheDocument())
    expect(screen.getByText('Facture FAC-002 à régler')).toBeInTheDocument()
    expect(screen.getByText(/À faire/)).toBeInTheDocument()
  })

  it('rend un type inconnu (ETAPE_A_VALIDER simulé) avec le style neutre sans erreur', async () => {
    vi.mocked(clientVaultService.listClientActionItems).mockResolvedValue({
      items: [
        {
          type: 'ETAPE_A_VALIDER' as never,
          title: 'Étape « Maquettes » à valider',
          detail: '',
          project: { id: 'p1', name: 'Refonte' },
          link: '/espace-client/projets/p1',
          dueAt: null,
          amount: null,
          createdAt: '2026-08-03T00:00:00.000Z',
        },
      ],
    })
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Étape « Maquettes » à valider')).toBeInTheDocument())
  })
})
