import React from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import { I18nProvider } from '../context/I18nContext'
import { serviceOffers } from '../content/serviceOffers'
import Footer from './Footer'
import Navbar from './Navbar'

function renderNavigation(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <I18nProvider>{ui}</I18nProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('navigation des offres publiques', () => {
  it('rend les quatre offres dans le menu, avec une URL interne cohérente', () => {
    const { container } = renderNavigation(<Navbar />)
    const servicesMenu = container.querySelector<HTMLDetailsElement>('details.nav-services')
    expect(servicesMenu).toBeTruthy()
    fireEvent.click(servicesMenu!.querySelector('summary')!)

    for (const offer of serviceOffers) {
      expect(
        within(servicesMenu!)
          .getByRole('link', { name: new RegExp(`^${offer.label}`) })
          .getAttribute('href'),
      ).toBe(offer.to)
    }
  })

  it('rend les quatre offres dans le pied de page', () => {
    renderNavigation(<Footer />)

    for (const offer of serviceOffers) {
      const link = screen.getByRole('link', { name: offer.label })
      expect(link.getAttribute('href')).toBe(offer.to)
    }
  })
})
