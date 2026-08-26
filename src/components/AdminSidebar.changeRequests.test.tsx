import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminSidebar from './AdminSidebar'
import * as api from '../lib/api'

const SUPER_ADMIN = {
  _id: 'a1',
  name: 'Raphael',
  email: 'admin@example.test',
  role: 'SUPER_ADMIN',
  permissions: [],
}

const currentUser = { value: { ...SUPER_ADMIN } }

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: currentUser.value, logout: vi.fn() }) }))
vi.mock('../context/MessagingContext', () => ({ useMessaging: () => ({ conversations: [] }) }))
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api')
  return { ...actual, apiFetch: vi.fn() }
})

function mockStats(aTraiter: number) {
  vi.mocked(api.apiFetch).mockImplementation((path: string) => {
    if (path === '/api/admin/change-requests/stats') return Promise.resolve({ aTraiter, enCours: 0 })
    return Promise.resolve({ decisions: [] })
  })
}

afterEach(() => {
  vi.clearAllMocks()
  currentUser.value = { ...SUPER_ADMIN }
})

describe('entrée « Demandes clients » de la sidebar admin', () => {
  it('affiche le compteur des demandes à qualifier', async () => {
    mockStats(4)
    render(
      <MemoryRouter>
        <AdminSidebar collapsed={false} />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Demandes clients')).toBeInTheDocument()
    expect(await screen.findByLabelText('4 demandes à qualifier')).toHaveTextContent('4')
  })

  it('masque le badge quand il n’y a rien à qualifier', async () => {
    mockStats(0)
    render(
      <MemoryRouter>
        <AdminSidebar collapsed={false} />
      </MemoryRouter>,
    )

    await screen.findByText('Demandes clients')
    await waitFor(() => expect(screen.queryByLabelText(/demandes? à qualifier/)).not.toBeInTheDocument())
  })

  it('masque l’entrée à un rôle sans view_change_requests', async () => {
    mockStats(4)
    currentUser.value = { _id: 'r1', name: 'RH', email: 'rh@example.test', role: 'RH', permissions: [] }
    render(
      <MemoryRouter>
        <AdminSidebar collapsed={false} />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByText('Demandes clients')).not.toBeInTheDocument())
  })
})
