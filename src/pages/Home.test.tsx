import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { I18nProvider } from '../context/I18nContext'
import Home from './Home'

vi.mock('../hooks/useReveal', () => ({ useReveal: vi.fn() }))
vi.mock('../components/conversion/DualCta', () => ({ default: () => <div data-testid="dual-cta" /> }))
vi.mock('../components/qualification/NeedStart', () => ({
  default: ({ preset }: { preset?: string }) => <div data-testid="need-start" data-preset={preset} />,
}))

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

function section(id: string) {
  const element = document.getElementById(id)
  expect(element?.tagName).toBe('SECTION')
  return element as HTMLElement
}

describe('Home', () => {
  it('annonce un titre unique et complet, sans masquer les mots aux lecteurs d’écran', () => {
    renderHome()

    const title = 'Stratégie, communication et plateformes métier sur mesure.'
    const h1 = screen.getByRole('heading', { level: 1, name: title })
    expect(h1).toHaveTextContent(title)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(h1.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('oriente le hero vers le contact et la première offre', () => {
    renderHome()

    const hero = screen.getByRole('region', {
      name: 'Stratégie, communication et plateformes métier sur mesure.',
    })
    expect(within(hero).getByRole('link', { name: 'Parlons de votre projet' })).toHaveAttribute('href', '/contact')
    expect(within(hero).getByRole('link', { name: 'Découvrir les offres' })).toHaveAttribute('href', '#strategie')
  })

  it('présente les trois offres et réserve le badge Nouveau à la communication', () => {
    renderHome()

    const strategy = section('strategie')
    const communication = section('communication')
    const platforms = section('plateformes')
    expect(within(strategy).getByRole('link', { name: 'Échanger avec nous' })).toHaveAttribute(
      'href',
      '/contact?besoin=flou',
    )
    expect(within(communication).getByRole('link', { name: 'Découvrir l’offre' })).toHaveAttribute(
      'href',
      '/conseil-communication',
    )
    expect(within(platforms).getByRole('link', { name: 'Parlons de votre projet' })).toHaveAttribute(
      'href',
      '/contact?besoin=outil',
    )
    expect(within(communication).getByText('Nouveau')).toBeInTheDocument()
    expect(screen.getAllByText('Nouveau')).toHaveLength(1)
  })

  it('réunit les cinq formules et leurs liens préremplis dans la section plateformes', () => {
    renderHome()

    const links = within(section('plateformes'))
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.includes('&formule='))
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/contact?besoin=site&formule=vitrine',
      '/contact?besoin=site&formule=essentiel',
      '/contact?besoin=site&formule=business',
      '/contact?besoin=site&formule=boutique',
      '/contact?besoin=outil&formule=mesure',
    ])
  })

  it('propose l’entrée du formulaire avec le contexte accueil, sans appel de durée imposée', () => {
    const { container } = renderHome()

    expect(screen.getByTestId('need-start')).toHaveAttribute('data-preset', 'home')
    expect(container).not.toHaveTextContent(/appel de/i)
  })

  it('relie le bandeau Réalisations aux projets externes et à la page de références', () => {
    renderHome()

    const strip = screen.getByRole('navigation', { name: 'Quelques réalisations' })
    const externalLinks = within(strip)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('target') === '_blank')
    expect(externalLinks).toHaveLength(4)
    externalLinks.forEach((link) => {
      expect(link.getAttribute('href')).toMatch(/^https:\/\//)
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })
    expect(within(strip).getByRole('link', { name: 'Toutes les réalisations' })).toHaveAttribute(
      'href',
      '/realisations',
    )
  })

  it('conserve la méthode, la FAQ et un vocabulaire sans devis, acheter ou vendre hors FAQ', () => {
    const { container } = renderHome()

    expect(within(section('methode')).getByRole('link', { name: 'La méthode en détail' })).toHaveAttribute(
      'href',
      '/methode',
    )
    expect(within(section('faq')).getByRole('heading', { level: 2 })).toBeInTheDocument()
    const content = container.querySelector('.sy-home')!.cloneNode(true) as HTMLElement
    content.querySelector('#faq')?.remove()
    content.querySelectorAll('script').forEach((script) => script.remove())
    expect(content).not.toHaveTextContent(/devis|acheter|vendre/i)
  })
})
