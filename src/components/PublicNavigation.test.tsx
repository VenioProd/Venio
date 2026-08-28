import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  it('rend le lien Sites web dans la nav resserrée, avec une URL interne cohérente', () => {
    renderNavigation(<Navbar />)

    const sitesOffer = serviceOffers.find((offer) => offer.to === '/services/sites')!
    const link = screen.getAllByRole('link', { name: new RegExp(`^${sitesOffer.label}`) })[0]
    expect(link.getAttribute('href')).toBe(sitesOffer.to)
  })

  it('rend les offres dans le pied de page, avec une URL interne cohérente', () => {
    renderNavigation(<Footer />)

    for (const offer of serviceOffers) {
      const link = screen.getByRole('link', { name: offer.label })
      expect(link.getAttribute('href')).toBe(offer.to)
    }
  })
})
