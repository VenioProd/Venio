import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
  it('renders the selected published portfolio without the removed V&A catalogue', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: /des idées qui prennent forme/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Decisio' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /voir le site/i })[0]).toHaveAttribute('target', '_blank')
    expect(screen.queryByText(/catalogue v&a/i)).not.toBeInTheDocument()
  })

  it('keeps a direct contact path', () => {
    renderPage()

    expect(screen.getByRole('link', { name: /parlons-en/i })).toHaveAttribute('href', '/contact')
  })

  it('filters the published projects without changing their external-link behaviour', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Produits' }))

    expect(screen.getByRole('heading', { name: 'Yumi' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Absys Simulator' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Decisio' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /voir le simulateur/i })).toHaveAttribute(
      'href',
      'https://simulator.absys.school/',
    )
  })
})
