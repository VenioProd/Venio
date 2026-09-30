import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { I18nProvider } from '../context/I18nContext'
import ConseilCommunication from './ConseilCommunication'

vi.mock('../hooks/useReveal', () => ({ useReveal: vi.fn() }))

const renderPage = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <I18nProvider>
          <ConseilCommunication />
        </I18nProvider>
      </MemoryRouter>
    </HelmetProvider>,
  )

describe('ConseilCommunication', () => {
  it('has a single h1 and the cut list', () => {
    renderPage()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByText('Ce qu’on coupe souvent')).toBeInTheDocument()
    expect(screen.getByText('Une plaquette de 24 pages')).toBeInTheDocument()
  })

  it('lists the five services with a deliverable and an "inutile si"', () => {
    renderPage()

    for (const title of [
      'Un état des lieux écrit',
      'Une phrase que vos clients répètent',
      'Canaux, rythme, budget',
      'Une ligne éditoriale tenable',
      'Trois chiffres, chaque mois',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
    expect(screen.getAllByText(/^Livré :/)).toHaveLength(5)
  })

  it('routes the two other trades to the form', () => {
    renderPage()

    expect(screen.getByRole('link', { name: /un nom, une voix, un système/i })).toHaveAttribute(
      'href',
      '/contact?besoin=marque',
    )
    expect(screen.getByRole('link', { name: /l’outil que le tableur ne fait plus/i })).toHaveAttribute(
      'href',
      '/contact?besoin=outil',
    )
  })
})
