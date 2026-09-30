import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { I18nProvider } from '../context/I18nContext'
import ServicesSites from './ServicesSites'

vi.mock('../hooks/useReveal', () => ({ useReveal: vi.fn() }))

const renderPage = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <I18nProvider>
          <ServicesSites />
        </I18nProvider>
      </MemoryRouter>
    </HelmetProvider>,
  )

describe('ServicesSites', () => {
  it('has a single h1 and the five formulas', () => {
    renderPage()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    for (const title of [
      'Se faire connaître.',
      'Publier soi-même.',
      'Vendre et suivre ses clients.',
      'Vendre en grand.',
      'Un outil rien qu’à vous.',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
  })

  it('links every formula to the qualification form with the right preset', () => {
    renderPage()

    const links = screen.getAllByRole('link', { name: /cette formule/i }).map((a) => a.getAttribute('href'))
    expect(links).toEqual([
      '/contact?besoin=site&formule=vitrine',
      '/contact?besoin=site&formule=essentiel',
      '/contact?besoin=site&formule=business',
      '/contact?besoin=site&formule=boutique',
      '/contact?besoin=outil&formule=mesure',
    ])
  })

  it('shows no unverified badge or price', () => {
    renderPage()

    expect(screen.queryByText(/le plus demandé/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/€/)).not.toBeInTheDocument()
  })

  it('ends with the need entry block', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: /votre besoin/i })).toBeInTheDocument()
  })
})
