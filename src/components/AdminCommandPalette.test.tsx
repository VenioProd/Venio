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

  it('acts as a modal: it traps focus, hides the app root and restores focus', () => {
    document.body.innerHTML = '<div id="root"><button type="button">Ouvrir la recherche</button></div>'
    const root = document.getElementById('root')!
    const host = document.body.appendChild(document.createElement('div'))
    const trigger = screen.getByRole('button', { name: 'Ouvrir la recherche' })
    trigger.focus()
    const { unmount } = render(
      <MemoryRouter>
        <AdminCommandPalette onClose={() => {}} />
      </MemoryRouter>,
      { container: host },
    )

    const input = screen.getByRole('textbox', { name: 'Rechercher un module ou une action' })
    expect(root).toHaveAttribute('inert')
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(input).toHaveFocus()

    const options = screen.getAllByRole('option')
    options[options.length - 1].focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(input).toHaveFocus()

    unmount()
    expect(root).not.toHaveAttribute('inert')
    expect(trigger).toHaveFocus()
  })
})
