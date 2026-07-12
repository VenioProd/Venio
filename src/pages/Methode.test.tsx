import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { I18nProvider } from '../context/I18nContext'
import Methode from './Methode'

vi.mock('../hooks/useReveal', () => ({ useReveal: vi.fn() }))

describe('Methode', () => {
  it('publie les étapes, les livrables et la cadence de travail', () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <I18nProvider>
            <Methode />
          </I18nProvider>
        </MemoryRouter>
      </HelmetProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Cadrer' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Transmettre' })).toBeInTheDocument()
    expect(screen.getAllByText('Livrables')).toHaveLength(5)
    expect(screen.getByText(/Point d’avancement hebdomadaire/)).toBeInTheDocument()
  })
})
