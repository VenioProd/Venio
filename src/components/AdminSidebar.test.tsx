import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AdminSidebar from './AdminSidebar'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'viewer', name: 'Viewer', email: 'viewer@example.test', role: 'VIEWER', permissions: [] },
    logout: vi.fn(),
  }),
}))
vi.mock('../context/MessagingContext', () => ({ useMessaging: () => ({ conversations: [] }) }))

describe('VENIO-101 — navigation admin accessible', () => {
  it('uses native buttons for home and exposes the mobile drawer as a modal', () => {
    document.body.innerHTML = '<div id="root"></div>'
    const root = document.getElementById('root')!
    render(
      <MemoryRouter>
        <AdminSidebar collapsed={false} drawerOpen onDrawerClose={() => {}} />
      </MemoryRouter>,
      { container: root },
    )

    // La marque du desktop est correctement rendue mais masquée à l'arbre
    // d'accessibilité tant que le drawer modal est ouvert.
    expect(screen.getByRole('button', { name: 'Accueil Venio Admin' })).toHaveProperty('tagName', 'BUTTON')
    const drawer = screen.getByRole('dialog', { name: 'Navigation mobile' })
    expect(drawer).toHaveAttribute('aria-modal', 'true')
    expect(root).toHaveAttribute('inert')
    expect(screen.getByRole('button', { name: 'Fermer le menu de navigation' })).toHaveFocus()
  })
})
