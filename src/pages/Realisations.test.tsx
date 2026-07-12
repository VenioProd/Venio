import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { I18nProvider } from '../context/I18nContext'
import Realisations from './Realisations'

vi.mock('../hooks/useReveal', () => ({ useReveal: vi.fn() }))

const renderPage = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <I18nProvider>
          <Realisations />
        </I18nProvider>
      </MemoryRouter>
    </HelmetProvider>,
  )

describe('Realisations', () => {
  it('does not present unverified client work as public case studies', () => {
    renderPage()

    expect(screen.getByText(/ne publions pas de cas client nominatif/i)).toBeInTheDocument()
    expect(screen.getByText(/Études de cas à publier/i)).toBeInTheDocument()
    expect(screen.getByText(/Aucun témoignage public pour le moment/i)).toBeInTheDocument()
    expect(screen.queryByText(/Cabinet Mercier|École NOVA|Studio Prism|FlowMetrics/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Pages créées|Référence publiée|Donnée chiffrée publiée/i)).not.toBeInTheDocument()
  })

  it('keeps an honest contact path for private reference discussions', () => {
    renderPage()

    expect(screen.getByRole('link', { name: /contactez-nous/i })).toHaveAttribute('href', 'mailto:contact@venio.paris')
  })
})
