import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { User } from '../types/auth.types'
import AdminCommandPalette from './AdminCommandPalette'

const viewer: User = {
  _id: 'viewer-1',
  name: 'Viewer',
  email: 'viewer@example.test',
  role: 'VIEWER',
  permissions: [],
}

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: viewer }) }))

describe('AdminCommandPalette', () => {
  it('shows only authorised results and supports keyboard selection', () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <AdminCommandPalette onClose={onClose} />
      </MemoryRouter>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Recherche rapide' })
    expect(screen.getByRole('option', { name: /Comptabilité/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /CRM/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Créer ou qualifier un lead/i })).not.toBeInTheDocument()

    fireEvent.keyDown(dialog, { key: 'ArrowDown' })
    fireEvent.keyDown(dialog, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes with Escape', () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <AdminCommandPalette onClose={onClose} />
      </MemoryRouter>,
    )

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
