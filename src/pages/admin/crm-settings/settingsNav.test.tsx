import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CrmSettings from './index'
import { SETTINGS_GROUPS, SETTINGS_SECTION_IDS, settingsSectionOf } from './sections'

const apiFetch = vi.fn()
vi.mock('../../../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', role: 'ADMIN' } }) }))

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockImplementation(async (url: string) => {
    if (url === '/api/admin/crm/settings') return { settings: { weeklyReportRecipients: [] } }
    if (url === '/api/admin/admins') return { users: [] }
    if (url.startsWith('/api/admin/crm/suppression')) return { entries: [], total: 0, page: 1, pages: 1 }
    return {}
  })
})

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <CrmSettings />
    </MemoryRouter>,
  )

describe('réglages CRM — sections et sous-chemins', () => {
  it('chaque section a un sous-chemin et une seule place dans les quatre groupes', () => {
    expect(SETTINGS_GROUPS).toHaveLength(4)
    const placed = SETTINGS_GROUPS.flatMap((group) => group.sections)
    expect([...placed].sort()).toEqual([...SETTINGS_SECTION_IDS].sort())
    expect(SETTINGS_SECTION_IDS).toHaveLength(17)
  })

  it('lit la section dans l’adresse, avec ou sans barre finale, sinon la première', () => {
    expect(settingsSectionOf('/admin/crm/piloter/reglages/telephonie')).toBe('telephonie')
    expect(settingsSectionOf('/admin/crm/piloter/reglages/opposes/')).toBe('opposes')
    expect(settingsSectionOf('/admin/crm/piloter/reglages')).toBe('statuts')
    expect(settingsSectionOf('/admin/crm/piloter/reglages/inconnue')).toBe('statuts')
  })
})

describe('réglages CRM — navigation par sections', () => {
  it('un seul titre de page et les dix-sept sections en liens, rangées en quatre groupes', async () => {
    renderAt('/admin/crm/piloter/reglages')
    await screen.findAllByRole('checkbox')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const nav = screen.getByRole('navigation', { name: 'Sections des réglages' })
    expect(within(nav).getAllByRole('link')).toHaveLength(17)
    expect(
      within(nav)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      'Pipeline et qualification',
      'Alertes et notifications',
      'Appels, téléphonie et IA',
      'Données et conservation',
    ])
    // Sans sous-chemin : la première section, marquée comme courante.
    expect(within(nav).getByRole('link', { name: 'Statuts' })).toHaveAttribute('aria-current', 'page')
  })

  it('le sous-chemin choisit la section et son lien est le seul courant', async () => {
    renderAt('/admin/crm/piloter/reglages/conservation')
    expect(await screen.findByLabelText('Durée de conservation')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Sections des réglages' })
    expect(within(nav).getByRole('link', { name: 'Conservation' })).toHaveAttribute('aria-current', 'page')
    expect(
      within(nav)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current')),
    ).toHaveLength(1)
    // Les autres sections ne sont pas montées.
    expect(screen.queryByText('Changements de statut')).toBeNull()
  })

  it('un sous-chemin inconnu retombe sur la première section', async () => {
    renderAt('/admin/crm/piloter/reglages/inconnue')
    expect(await screen.findByText('Changements de statut')).toBeInTheDocument()
  })

  it('le menu au-dessus du contenu change de section', async () => {
    renderAt('/admin/crm/piloter/reglages/statuts')
    await screen.findByText('Changements de statut')
    const jump = screen.getByLabelText('Section des réglages')
    expect(jump).toHaveValue('statuts')
    fireEvent.change(jump, { target: { value: 'escalade' } })
    expect(await screen.findByRole('heading', { name: 'Escalade', level: 2 })).toBeInTheDocument()
  })
})
