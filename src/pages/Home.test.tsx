import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { I18nProvider } from '../context/I18nContext'
import Home from './Home'

vi.mock('../hooks/useReveal', () => ({ useReveal: vi.fn() }))
vi.mock('../components/conversion/DualCta', () => ({ default: () => <div data-testid="dual-cta" /> }))
vi.mock('../components/qualification/NeedStart', () => ({ default: () => <div data-testid="need-start" /> }))

const renderHome = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <I18nProvider>
          <Home />
        </I18nProvider>
      </MemoryRouter>
    </HelmetProvider>,
  )

describe('Home', () => {
  it('annonce le titre unique, sans jamais le masquer aux lecteurs d’écran', () => {
    renderHome()

    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('Sites web, plateformes et communication, à Paris.')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('présente quatre métiers, le conseil marketing en premier avec le badge Nouveau', () => {
    renderHome()

    const links = within(document.getElementById('mh-metiers') as HTMLElement).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/conseil-communication',
      '/contact?besoin=flou',
      '/contact?besoin=marque',
      '/contact?besoin=outil',
    ])
    expect(within(links[0]).getByText('Nouveau')).toBeInTheDocument()
    expect(within(links[0]).getByText('Un plan de communication qui tient')).toBeInTheDocument()
  })

  it('remplace l’appel de trente minutes par l’entrée du formulaire', () => {
    renderHome()

    expect(screen.getByTestId('need-start')).toBeInTheDocument()
    expect(screen.queryByText(/appel de/i)).not.toBeInTheDocument()
  })

  it('garde le radar des réalisations, avec ses deux listes', () => {
    renderHome()

    expect(screen.getByRole('img', { name: /Ce que Venio a construit/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nos logiciels' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nos sites' })).toBeInTheDocument()
  })
})
