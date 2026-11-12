import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import AdminShell from './AdminShell'
import SearchModal from './admin/SearchModal'
import { globalSearch } from '../services/search'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'rh', name: 'RH', role: 'RH', permissions: [] } }),
}))
vi.mock('../context/MessagingContext', () => ({
  MessagingProvider: ({ children }: { children: ReactNode }) => children,
  useMessaging: () => ({ conversations: [] }),
}))
vi.mock('../context/NotificationContext', () => ({
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('./AdminSidebar', () => ({ default: () => null, ADMIN_NAV_ICONS: new Proxy({}, { get: () => () => null }) }))
vi.mock('./PushPermissionPrompt', () => ({ default: () => null }))
vi.mock('./admin/NotificationBell', () => ({ default: () => null }))
vi.mock('./ThemeToggle', () => ({ default: () => null }))
vi.mock('./LanguageSelect', () => ({ default: () => null }))
vi.mock('../services/search', () => ({
  globalSearch: vi
    .fn()
    .mockResolvedValue([
      {
        type: 'project',
        id: 'project',
        title: 'Projet trouvé',
        subtitle: 'Client',
        link: '/admin/projets/clients/project',
      },
    ]),
}))

describe('recherche globale', () => {
  it('opens one body palette with permitted hub tabs and respects a handled shortcut', async () => {
    const handled = (event: KeyboardEvent) => event.preventDefault()
    window.addEventListener('keydown', handled)
    const { container } = render(
      <MemoryRouter>
        <AdminShell />
        <SearchModal />
      </MemoryRouter>,
    )
    try {
      fireEvent.keyDown(window, { key: 'k', metaKey: true })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    } finally {
      window.removeEventListener('keydown', handled)
    }

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = screen.getByRole('dialog', { name: 'Recherche rapide' })
    expect(document.querySelectorAll('input')).toHaveLength(1)
    expect(container).not.toContainElement(dialog)
    expect(within(dialog).getByRole('option', { name: /Envoi groupé/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('option', { name: /Notifications/ })).toBeInTheDocument()
    expect(within(dialog).queryByRole('option', { name: /Automatisations/ })).not.toBeInTheDocument()
    vi.useFakeTimers()
    try {
      const input = within(dialog).getByRole('textbox')
      fireEvent.change(input, { target: { value: 'p' } })
      await act(async () => {
        vi.advanceTimersByTime(300)
      })
      expect(globalSearch).not.toHaveBeenCalled()
      fireEvent.change(input, { target: { value: 'pr' } })
      await act(async () => {
        vi.advanceTimersByTime(249)
      })
      expect(globalSearch).not.toHaveBeenCalled()
      await act(async () => {
        vi.advanceTimersByTime(1)
      })
      expect(globalSearch).toHaveBeenCalledExactlyOnceWith('pr')
      const options = within(dialog).getAllByRole('option')
      expect(options[options.length - 1]).toHaveTextContent('Projet trouvé')
      fireEvent.keyDown(input, { key: 'ArrowUp' })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
