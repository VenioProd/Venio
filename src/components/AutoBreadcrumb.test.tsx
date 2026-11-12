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
      <MemoryRouter key="crm" initialEntries={['/admin/crm/sequences']}>
        <AutoBreadcrumb />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'CRM' })).toHaveAttribute('href', '/admin/crm')
    expect(screen.getByText('Séquences')).toBeInTheDocument()
  })
})
