import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { I18nProvider } from '../../context/I18nContext'
import { HOME_FAQ } from '../../content/faq'
import Faq from './Faq'

const afficher = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <I18nProvider>
          <Faq items={HOME_FAQ} />
        </I18nProvider>
      </MemoryRouter>
    </HelmetProvider>,
  )

describe('Faq', () => {
  it('affiche les six questions de la home', () => {
    const { container } = afficher()

    expect(HOME_FAQ).toHaveLength(6)
    for (const item of HOME_FAQ) {
      expect(screen.getByRole('heading', { name: item.question })).toBeInTheDocument()
    }
    expect(container.querySelectorAll('summary')).toHaveLength(6)
  })

  it('rend chaque réponse dans le document, même accordéon replié', () => {
    afficher()

    for (const item of HOME_FAQ) {
      expect(screen.getByText(item.answer)).toBeInTheDocument()
    }
  })

  it('ne pose aucun h1 : la page publique n’en tolère qu’un', () => {
    const { container } = afficher()

    expect(container.querySelectorAll('h1')).toHaveLength(0)
    expect(container.querySelectorAll('h2')).toHaveLength(1)
  })
})
