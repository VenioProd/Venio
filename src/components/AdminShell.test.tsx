import type { ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminShell from './AdminShell'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'admin', name: 'Admin', email: 'admin@example.test', role: 'SUPER_ADMIN', permissions: [] },
    logout: vi.fn(),
  }),
}))
vi.mock('../context/MessagingContext', () => ({
  useMessaging: () => ({ conversations: [] }),
  MessagingProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('../context/NotificationContext', () => ({
  useNotifications: () => ({ unreadCount: 0, notifications: [], markAsRead: vi.fn(), markAllAsRead: vi.fn() }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }) }))
vi.mock('../lib/api', () => ({ apiFetch: vi.fn().mockResolvedValue({ decisions: [], aTraiter: 0 }) }))
vi.mock('./PushPermissionPrompt', () => ({ default: () => null }))
const preference = 'venio-admin-sidebar-collapsed'
afterEach(() => localStorage.removeItem(preference))
const renderShell = () =>
  render(
    <MemoryRouter initialEntries={['/admin/mon-espace']}>
      <AdminShell />
    </MemoryRouter>,
  )

describe('AdminShell Système', () => {
  it('defaults to a rail, persists pinning and reads the existing preference', () => {
    const { container, unmount } = renderShell()
    expect(container.querySelector('.admin-shell')).toHaveAttribute('data-collapsed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Épingler la navigation' }))
    expect(container.querySelector('.admin-shell')).toHaveAttribute('data-collapsed', 'false')
    expect(localStorage.getItem(preference)).toBe('false')
    unmount()
    const restored = renderShell()
    expect(restored.container.querySelector('.admin-shell')).toHaveAttribute('data-collapsed', 'false')
  })

  it('provides existing quick actions, notifications, guide and theme control in the topbar', () => {
    const { container } = renderShell()
    const header = screen.getByRole('banner')
    const details = container.querySelector('details')!
    fireEvent.click(within(header).getByText('Créer'))
    details.open = true
    const actions = within(header).getByRole('navigation', { name: 'Créer' })
    expect(within(actions).getAllByRole('link')).toHaveLength(4)
    expect(within(actions).getByRole('link', { name: 'Créer un projet' })).toHaveAttribute(
      'href',
      '/admin/projets/nouveau',
    )
    expect(within(header).getByRole('navigation', { name: /Fil d.Ariane/ })).toHaveTextContent('Accueil')
    expect(within(header).getByRole('link', { name: 'Guide' })).toHaveAttribute('href', '/admin/guide')
    expect(within(header).getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Passer en mode clair' })).toBeInTheDocument()
    fireEvent.keyDown(details, { key: 'Escape' })
    expect(details.open).toBe(false)
  })

  it('opens a complete mobile sheet, then opens search from it', () => {
    renderShell()
    const tabs = screen.getByRole('navigation', { name: 'Navigation mobile' })
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Accueil', 'Inbox', 'Projets', 'CRM'])
    fireEvent.click(within(tabs).getByRole('button', { name: 'Ouvrir la navigation complète' }))
    const sheet = screen.getByRole('dialog', { name: 'Navigation mobile' })
    expect(within(sheet).getByRole('link', { name: 'Système' })).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'Formation' })).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Recherche rapide' }))
    expect(screen.queryByRole('dialog', { name: 'Navigation mobile' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Recherche rapide' })).toBeInTheDocument()
  })

  it('opens search with Cmd/Ctrl K and removes the admin theme scope on unmount', () => {
    const { unmount } = renderShell()
    expect(document.body).toHaveClass('admin-system-theme')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByRole('dialog', { name: 'Recherche rapide' })).toBeInTheDocument()
    unmount()
    expect(document.body).not.toHaveClass('admin-system-theme')
  })
})
