import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RichLeadTable from './RichLeadTable'
import { weightedOf, probabilityOf } from './columns'
import type { Lead } from '../../../../types/crm.types'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('../../../../lib/api', () => ({ apiFetch }))
vi.mock('../../../../lib/exportCsv', () => ({ exportToCsv: vi.fn() }))

const admins = [{ _id: 'u1', name: 'Raphaël B.', email: 'r@x.fr', role: 'SUPER_ADMIN' }]
const adminsById = { u1: admins[0] }
const leads: Lead[] = [
  {
    _id: 'a',
    company: 'Atelier Pivoine',
    status: 'PROPOSAL',
    budget: 10000,
    project: 'ARROW',
    assignedTo: 'u1',
    tags: ['vip'],
    leadTemperature: 'CHAUD',
  },
  { _id: 'b', company: 'Brasserie Quai 9', status: 'LEAD', budget: 6000, project: 'VENIO', probability: 50 },
  { _id: 'c', company: 'Cèdres', status: 'WON', budget: 13000, project: 'ARTOSERA' },
]

const setup = (extra: Partial<Parameters<typeof RichLeadTable>[0]> = {}) => {
  const props = {
    project: '',
    onProjectChange: vi.fn(),
    leads,
    admins,
    adminsById,
    canManageCrm: true,
    onOpenLead: vi.fn(),
    onReload: vi.fn().mockResolvedValue(undefined),
    onError: vi.fn(),
    ...extra,
  }
  render(<RichLeadTable {...props} />)
  return props
}

describe('valeurs dérivées', () => {
  it('pondère par la probabilité de l’étape, sauf valeur saisie, et ignore les leads fermés', () => {
    expect(probabilityOf(leads[0])).toBe(65)
    expect(weightedOf(leads[0])).toBe(6500)
    expect(weightedOf(leads[1])).toBe(3000)
    expect(weightedOf(leads[2])).toBe(0)
  })
})

describe('<RichLeadTable />', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ items: [] })
    localStorage.clear()
  })

  it('affiche les colonnes par défaut triées par pondéré et ouvre la fiche', () => {
    const props = setup()
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Atelier Pivoine')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Brasserie Quai 9/ }))
    expect(props.onOpenLead).toHaveBeenCalledWith(leads[1])
  })

  it('ajoute une colonne depuis le panneau et mémorise le choix', () => {
    setup()
    expect(screen.queryByRole('columnheader', { name: /Secteur/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Colonnes/ }))
    fireEvent.click(screen.getByLabelText(/Secteur/))
    expect(screen.getByRole('columnheader', { name: /Secteur/ })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('venio.crm.columns.v1')!)).toContain('sector')
  })

  it('filtre par plateforme et recalcule les indicateurs', () => {
    const props = setup({ project: 'ARROW' })
    expect(screen.queryByText('Brasserie Quai 9')).toBeNull()
    expect(screen.getByText('Atelier Pivoine')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Projet'), { target: { value: 'VENIO' } })
    expect(props.onProjectChange).toHaveBeenCalledWith('VENIO')
  })

  it('sélectionne des leads et envoie l’action groupée après confirmation', async () => {
    apiFetch.mockImplementation((path: string) =>
      Promise.resolve(path.includes('/bulk') ? { action: 'archive', ok: 2, failed: 0, results: [] } : { items: [] }),
    )
    const props = setup()
    fireEvent.click(screen.getByLabelText('Tout sélectionner'))
    expect(screen.getByRole('region', { name: 'Actions groupées' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(props.onReload).toHaveBeenCalled())
    const call = apiFetch.mock.calls.find(([p]) => String(p).includes('/leads/bulk'))!
    expect(JSON.parse(call[1].body)).toMatchObject({ action: 'archive', ids: expect.arrayContaining(['a', 'b', 'c']) })
  })

  it('n’offre ni sélection ni actions groupées sans droit d’écriture', () => {
    setup({ canManageCrm: false })
    expect(screen.queryByLabelText('Tout sélectionner')).toBeNull()
  })

  it('enregistre une vue avec les colonnes courantes', async () => {
    apiFetch.mockImplementation((path: string, opts?: { method?: string }) =>
      Promise.resolve(
        opts?.method === 'POST'
          ? {
              _id: 'v1',
              name: 'Arrow',
              scope: 'PRIVATE',
              owner: 'u1',
              filters: {},
              columns: [],
              sort: null,
              mode: 'table',
              pinned: false,
            }
          : { items: [] },
      ),
    )
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer cette vue/ }))
    fireEvent.change(screen.getByLabelText('Nom de la vue'), { target: { value: 'Arrow' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(apiFetch.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(true))
    const call = apiFetch.mock.calls.find(([, o]) => o?.method === 'POST')!
    expect(JSON.parse(call[1].body)).toMatchObject({
      name: 'Arrow',
      scope: 'PRIVATE',
      mode: 'table',
      columns: expect.arrayContaining(['company', 'status']),
    })
  })
})
