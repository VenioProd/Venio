import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminEdit from './AdminEdit'
import AdminList from './AdminList'

const apiFetch = vi.fn()
const auth = vi.hoisted(() => ({ role: 'SUPER_ADMIN' }))
vi.mock('../../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'me', role: auth.role } }) }))
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

const member = (extra: Record<string, unknown> = {}) => ({
  _id: 'm1',
  name: 'Marie',
  email: 'marie@venio.test',
  role: 'COMMERCIAL',
  ...extra,
})

beforeEach(() => {
  auth.role = 'SUPER_ADMIN'
  apiFetch.mockReset()
  apiFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
    if (url === '/api/admin/admins/m1' && opts?.method === 'PATCH') return { user: member() }
    if (url === '/api/admin/admins/m1') return { user: member({ crmEntities: ['ARROW'] }) }
    if (url === '/api/admin/admins')
      return { users: [member({ crmEntities: ['VENIO', 'ARROW'] }), member({ _id: 'm2', name: 'Paul' })] }
    return {}
  })
})

const renderEdit = () =>
  render(
    <MemoryRouter initialEntries={['/admin/comptes-admin/m1']}>
      <Routes>
        <Route path="/admin/comptes-admin/:userId" element={<AdminEdit />} />
      </Routes>
    </MemoryRouter>,
  )

describe('édition d’un membre — périmètre par entité', () => {
  it('super-admin : coche les entités et les envoie dans le PATCH', async () => {
    renderEdit()
    const arrow = await screen.findByRole('checkbox', { name: 'Arrow' })
    expect(arrow).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Venio' })).not.toBeChecked()
    expect(screen.getByText(/Vide = toutes les entités/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Decisio' }))
    fireEvent.click(arrow)
    fireEvent.submit(arrow.closest('form')!)
    await waitFor(() =>
      expect(apiFetch.mock.calls.some(([, o]) => (o as RequestInit | undefined)?.method === 'PATCH')).toBe(true),
    )
    const patch = apiFetch.mock.calls.find(([, o]) => (o as RequestInit | undefined)?.method === 'PATCH')!
    expect(JSON.parse(String((patch[1] as RequestInit).body)).crmEntities).toEqual(['DECISIO'])
  })

  it('autre rôle : la section n’est pas proposée et rien n’est envoyé', async () => {
    auth.role = 'ADMIN'
    renderEdit()
    await screen.findByDisplayValue('Marie')
    expect(screen.queryByRole('checkbox', { name: 'Arrow' })).toBeNull()
    fireEvent.submit(screen.getByDisplayValue('Marie').closest('form')!)
    await waitFor(() =>
      expect(apiFetch.mock.calls.some(([, o]) => (o as RequestInit | undefined)?.method === 'PATCH')).toBe(true),
    )
    const patch = apiFetch.mock.calls.find(([, o]) => (o as RequestInit | undefined)?.method === 'PATCH')!
    expect(JSON.parse(String((patch[1] as RequestInit).body))).not.toHaveProperty('crmEntities')
  })
})

describe('liste des membres — badge de périmètre', () => {
  it('affiche le badge uniquement pour un membre restreint', async () => {
    render(
      <MemoryRouter>
        <AdminList />
      </MemoryRouter>,
    )
    const badges = await screen.findAllByTestId('crm-entities-badge')
    expect(badges).toHaveLength(1)
    expect(badges[0]).toHaveTextContent('Entités : Venio, Arrow')
  })
})
