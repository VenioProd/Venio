import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import CrmPlan from './CrmPlan'
import { PLAN_ROWS } from './planRows'
import { ADMIN_HUBS } from '../../../lib/adminHubs'
import { SETTINGS_SECTION_IDS } from '../crm-settings/sections'

const allTabs = ADMIN_HUBS.crm.tabs
const only = (...ids: string[]) => allTabs.filter((tab) => ids.includes(tab.id))

const mount = (tabs: readonly (typeof allTabs)[number][]) =>
  render(
    <MemoryRouter>
      <CrmPlan visibleTabs={tabs} />
    </MemoryRouter>,
  )

describe('Où est quoi ?', () => {
  it('pour un profil complet : une ligne par fonction d’avant, un lien par endroit, une section pour l’externe', () => {
    mount(allTabs)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(PLAN_ROWS.length + 1)
    expect(within(table).getByRole('link', { name: 'Piloter, Réglages' })).toHaveAttribute(
      'href',
      '/admin/crm/piloter/reglages',
    )
    // Les sections et les sous-chemins créés par ce lot sont atteignables d'ici.
    expect(within(table).getByRole('link', { name: 'Téléphonie' })).toHaveAttribute(
      'href',
      '/admin/crm/piloter/reglages/telephonie',
    )
    expect(within(table).getByRole('link', { name: 'Séquences' })).toHaveAttribute(
      'href',
      '/admin/crm/piloter/automatisations?section=sequences',
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Pour un commercial externe' })).toBeInTheDocument()
    expect(screen.getByText(/\/commercial/)).toBeInTheDocument()
  })

  it('chaque lien mène à une adresse du CRM ; les sous-chemins de réglages existent tous', () => {
    mount(allTabs)
    const table = screen.getByRole('table')
    for (const link of within(table).getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^\/admin\/crm\//)
    }
    const settingsHrefs = PLAN_ROWS.flatMap((row) => row.links.map((link) => link.to)).filter((to) =>
      to.startsWith('/admin/crm/piloter/reglages/'),
    )
    for (const href of settingsHrefs) {
      expect(SETTINGS_SECTION_IDS as readonly string[]).toContain(href.split('/').pop())
    }
  })

  it('ne montre que ce que les droits ouvrent : liens et lignes d’un onglet interdit disparaissent', () => {
    mount(only('comptes', 'partenaires'))
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(within(table).getByRole('link', { name: 'Suivre, Comptes clients' })).toBeInTheDocument()
    expect(within(table).queryByRole('link', { name: /Réglages|Automatisations|Prévisions/ })).toBeNull()
    // Seuls les moments permis sont proposés en tête.
    expect(screen.getByRole('list', { name: 'Moments du travail' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Moments du travail' })).getAllByRole('link')).toHaveLength(1)
  })

  it('un profil sans aucun onglet voit un message, pas un tableau vide', () => {
    mount([])
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText('Aucun écran du CRM n’est ouvert à votre profil.')).toBeInTheDocument()
  })
})
