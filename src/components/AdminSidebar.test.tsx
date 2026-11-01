import { act, fireEvent, render, screen } from '@testing-library/react'
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

describe('rail Système', () => {
  it('se déploie au focus, reste ouvert entre ses liens puis se replie en sortie', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/admin/tickets/123']}>
        <AdminSidebar collapsed />
      </MemoryRouter>,
    )
    const rail = screen.getByRole('complementary')
    const requests = screen.getByRole('link', { name: 'Demandes' })
    expect(requests).toHaveAttribute('href', '/admin/demandes/clients')
    expect(requests).toHaveAttribute('aria-current', 'page')
    expect(rail).toHaveAttribute('data-expanded', 'false')
    fireEvent.focus(requests)
    expect(rail).toHaveAttribute('data-expanded', 'true')
    fireEvent.blur(requests, { relatedTarget: container.querySelector('a') })
    expect(rail).toHaveAttribute('data-expanded', 'true')
    fireEvent.blur(requests, { relatedTarget: null })
    expect(rail).toHaveAttribute('data-expanded', 'false')
  })

  it('diffère le repli au survol de 150 ms et annule le délai au retour', () => {
    vi.useFakeTimers()
    try {
      render(
        <MemoryRouter>
          <AdminSidebar collapsed />
        </MemoryRouter>,
      )
      const rail = screen.getByRole('complementary')
      fireEvent.mouseEnter(rail)
      expect(rail).toHaveAttribute('data-expanded', 'true')
      fireEvent.mouseLeave(rail)
      act(() => vi.advanceTimersByTime(149))
      expect(rail).toHaveAttribute('data-expanded', 'true')
      fireEvent.mouseEnter(rail)
      act(() => vi.advanceTimersByTime(1))
      expect(rail).toHaveAttribute('data-expanded', 'true')
      fireEvent.mouseLeave(rail)
      act(() => vi.advanceTimersByTime(150))
      expect(rail).toHaveAttribute('data-expanded', 'false')
    } finally {
      vi.useRealTimers()
    }
  })

  it('garde le rail épinglé ouvert et expose son état au clavier', () => {
    const toggle = vi.fn()
    render(
      <MemoryRouter>
        <AdminSidebar collapsed={false} onCollapseToggle={toggle} />
      </MemoryRouter>,
    )
    const rail = screen.getByRole('complementary')
    expect(rail).toHaveAttribute('data-pinned', 'true')
    fireEvent.mouseLeave(rail)
    expect(rail).toHaveAttribute('data-expanded', 'true')
    const pin = screen.getByRole('button', { name: 'Désépingler la navigation' })
    expect(pin).toHaveAttribute('aria-pressed', 'true')
    expect(pin).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(pin)
    expect(toggle).toHaveBeenCalledOnce()
  })

  it('affiche un rail sur tablette même avec une préférence épinglée', () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    try {
      render(
        <MemoryRouter>
          <AdminSidebar collapsed={false} />
        </MemoryRouter>,
      )
      const rail = screen.getByRole('complementary')
      expect(rail).toHaveAttribute('data-pinned', 'false')
      expect(rail).toHaveAttribute('data-expanded', 'false')
      fireEvent.click(screen.getByRole('button', { name: 'Étendre la navigation' }))
      expect(rail).toHaveAttribute('data-expanded', 'true')
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
    }
  })
})
