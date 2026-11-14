import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CrmAutomations from './index'

const apiFetch = vi.fn()
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', role: 'ADMIN' } }) }))
vi.mock('../../../../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

const rule = {
  _id: 'r1',
  name: 'Relance après 7 jours',
  description: '',
  status: 'ACTIVE',
  system: false,
  trigger: { type: 'LEAD_INACTIVE', params: { days: 7, statuses: ['CONTACTED'] } },
  conditions: { op: 'AND', items: [] },
  actions: [{ type: 'CREATE_TASK', params: { title: 'Relancer {contact}', dueInDays: 1, assignTo: 'owner' } }],
  limits: { perLead: 'DAYS', days: 7, maxPerRun: 50 },
  requireApproval: false,
  stats: { runs: 0, ok: 0, errors: 0, lastRunAt: null },
}

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockImplementation(async (url: string) => {
    if (url === '/api/admin/crm/rules') return { items: [rule] }
    if (url.startsWith('/api/admin/crm/rules/runs?')) return { items: [], page: 1, pageSize: 50, total: 0 }
    if (url === '/api/admin/crm/sequences') return { items: [], canAdminister: true }
    return {}
  })
})

function Where() {
  const location = useLocation()
  return <output aria-label="adresse">{location.pathname + location.search}</output>
}

const mount = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <CrmAutomations />
      <Where />
    </MemoryRouter>,
  )

describe('Automatisations — sections en liens', () => {
  it('un seul titre de page, quatre sections dans l’ordre de la maquette, la première courante', async () => {
    mount('/admin/crm/piloter/automatisations')
    await screen.findByText('Relance après 7 jours')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const nav = screen.getByRole('navigation', { name: 'Sections des automatisations' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('data-tab'))).toEqual(['regles', 'modeles', 'sequences', 'journal'])
    expect(links[0]).toHaveAttribute('aria-current', 'page')
    // Le compteur de règles vient des règles chargées, pas d'une valeur en dur.
    expect(links[0]).toHaveAccessibleName('Règles 1')
  })

  it('?section= reste la source : l’adresse choisit la section, un lien la change et garde le chemin', async () => {
    mount('/admin/crm/piloter/automatisations?section=sequences')
    const nav = await screen.findByRole('navigation', { name: 'Sections des automatisations' })
    expect(within(nav).getByRole('link', { name: 'Séquences' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('heading', { level: 2, name: /Séquences d’e-mails/ })).toBeInTheDocument()
    fireEvent.click(within(nav).getByRole('link', { name: 'Modèles' }))
    await waitFor(() =>
      expect(screen.getByLabelText('adresse')).toHaveTextContent('/admin/crm/piloter/automatisations?section=modeles'),
    )
    expect(within(nav).getByRole('link', { name: 'Modèles' })).toHaveAttribute('aria-current', 'page')
  })

  it('une section inconnue retombe sur les règles', async () => {
    mount('/admin/crm/piloter/automatisations?section=inconnue')
    expect(await screen.findByText('Relance après 7 jours')).toBeInTheDocument()
  })

  it('le bouton « Nouvelle règle » reste dans l’en-tête et ouvre le constructeur', async () => {
    mount('/admin/crm/piloter/automatisations')
    await screen.findByText('Relance après 7 jours')
    fireEvent.click(screen.getByRole('button', { name: /Nouvelle règle/ }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
