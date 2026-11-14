import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import AutoBreadcrumb from './AutoBreadcrumb'

describe('AutoBreadcrumb', () => {
  it('labels a hub and its tab from the hub catalogue instead of ambiguous slugs', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/admin/equipe/comptes/settings']}>
        <AutoBreadcrumb />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Équipe' })).toHaveAttribute('href', '/admin/equipe')
    expect(screen.getByRole('link', { name: 'Rôles & comptes' })).toHaveAttribute('href', '/admin/equipe/comptes')
    expect(screen.getByText('Paramètres')).toBeInTheDocument()

    rerender(
      <MemoryRouter key="crm" initialEntries={['/admin/crm/piloter/previsions']}>
        <AutoBreadcrumb />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'CRM' })).toHaveAttribute('href', '/admin/crm/aujourdhui')
    expect(screen.getByRole('link', { name: 'Piloter' })).toHaveAttribute('href', '/admin/crm/piloter')
    expect(screen.getByText('Prévisions et objectifs')).toBeInTheDocument()
  })

  it('range la fiche d’un lead sous l’onglet qui l’a ouverte', () => {
    const lead = '/admin/crm/leads/0123456789abcdef01234567'
    const { rerender } = render(
      <MemoryRouter initialEntries={[lead]}>
        <AutoBreadcrumb />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Suivre' })).toHaveAttribute('href', '/admin/crm/suivre')
    expect(screen.getByRole('link', { name: 'Pipeline' })).toHaveAttribute('href', '/admin/crm/suivre/pipeline')
    expect(screen.getByText('Détail')).toBeInTheDocument()

    rerender(
      <MemoryRouter key="semaine" initialEntries={[`${lead}?from=semaine`]}>
        <AutoBreadcrumb />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Aujourd’hui' })).toHaveAttribute('href', '/admin/crm/aujourdhui')
    expect(screen.getByRole('link', { name: 'Cette semaine' })).toHaveAttribute('href', '/admin/crm/aujourdhui/semaine')
  })
})
