import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import InternList from './index'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'SUPER_ADMIN' } }),
}))

vi.mock('../../../lib/api', () => ({
  apiFetch: vi.fn((url: string) => {
    if (url === '/api/admin/interns') return Promise.resolve([])
    if (url === '/api/admin/admins') return Promise.resolve({ users: [] })
    if (url.includes('report-notifs')) return Promise.resolve({ recipients: [] })
    return Promise.resolve([])
  }),
}))

vi.mock('../../../components/admin/InternDocuments', () => ({ default: () => null }))
vi.mock('../../../components/admin/InternKpi', () => ({ default: () => null }))

describe('InternList', () => {
  it('ouvre l’assistant de création depuis n’importe quel onglet', async () => {
    render(
      <MemoryRouter>
        <InternList />
      </MemoryRouter>,
    )

    // Un super admin arrive sur le tableau de bord : l'assistant s'ouvre quand même
    fireEvent.click(await screen.findByRole('button', { name: '+ Nouveau membre' }))

    expect(screen.getByRole('dialog', { name: 'Nouveau membre' })).toBeInTheDocument()
    for (const label of ['Super admin', 'RH', 'Commercial externe', 'Stagiaire', 'Alternant', 'Client']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeInTheDocument()
    }
  })
})
