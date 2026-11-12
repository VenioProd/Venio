import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RichLeadTable from './RichLeadTable'
import { exportToCsv } from '../../../../lib/exportCsv'
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
  render(
    <MemoryRouter initialEntries={['/admin/crm?project=ARROW&mode=liste']}>
      <RichLeadTable {...props} />
      <Location />
    </MemoryRouter>,
  )
  return props
}

function Location() {
  return <output data-testid="url">{useLocation().search}</output>
}

describe('valeurs dérivées', () => {
  it('pondère par la probabilité de l’étape, sauf valeur saisie, et ignore les leads fermés', () => {
    expect(probabilityOf(leads[0])).toBe(65)
    expect(weightedOf(leads[0])).toBe(6500)
    expect(weightedOf(leads[1])).toBe(3000)
    expect(weightedOf(leads[2])).toBe(0)
  })
})

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue({ items: [] })
  localStorage.clear()
})

describe('<RichLeadTable />', () => {
  it('trie l’activité récente d’abord, conserve les absents en dernier et ouvre la fiche', () => {
    const props = setup({
      leads: [
        { ...leads[0], createdAt: '2026-11-12' },
        { ...leads[1], lastInteractionAt: '2026-10-01' },
        { ...leads[2], lastInteractionAt: '2026-11-01' },
      ],
    })
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Cèdres')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Atelier Pivoine')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Brasserie Quai 9/ }))
    expect(props.onOpenLead).toHaveBeenCalledWith(expect.objectContaining({ _id: 'b' }))
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

  it('porte les filtres et le tri dans l’URL sans perdre le mode ni le projet', () => {
    setup()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Atelier' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lead' }))
    const params = new URLSearchParams(screen.getByTestId('url').textContent!)
    expect(params.get('q')).toBe('Atelier')
    expect(params.get('sort')).toBe('company')
    expect(params.get('dir')).toBe('asc')
    expect(params.get('mode')).toBe('liste')
    expect(params.get('project')).toBe('ARROW')
    fireEvent.change(screen.getByRole('combobox', { name: 'Vues enregistrées' }), { target: { value: 'hot' } })
    const hot = new URLSearchParams(screen.getByTestId('url').textContent!)
    expect(hot.get('q')).toBeNull()
    expect(hot.get('project')).toBeNull()
    expect(hot.get('temperature')).toBe('HOT')
    expect(hot.get('sort')).toBe('company')
  })

  it('saisit un tag dans un dialogue avant de l’envoyer aux leads sélectionnés', async () => {
    apiFetch.mockImplementation((path: string) =>
      Promise.resolve(path.includes('/bulk') ? { ok: 3, failed: 0 } : { items: [] }),
    )
    setup()
    fireEvent.click(screen.getByLabelText('Tout sélectionner'))
    fireEvent.click(screen.getByRole('button', { name: 'Plus' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tag' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Prioritaire' } })
    expect(apiFetch.mock.calls.some(([p]) => String(p).includes('/bulk'))).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmer' }))
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.some(
          ([p, opts]) => String(p).includes('/bulk') && JSON.parse(opts.body).payload.tag === 'Prioritaire',
        ),
      ).toBe(true),
    )
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

it('charge les archivés et restaure une ligne sans exposer les leads actifs', async () => {
  apiFetch.mockImplementation(async (path: string) => {
    if (path.includes('archived=true'))
      return { leads: [{ _id: 'old', company: 'Ancien lead', status: 'LEAD', archivedAt: '2026-01-01' }] }
    if (path.includes('/bulk')) return { ok: 1, failed: 0, results: [{ id: 'old', ok: true }] }
    return { items: [] }
  })
  setup()
  fireEvent.change(screen.getByRole('combobox', { name: 'Vues enregistrées' }), { target: { value: 'archived' } })
  expect(await screen.findByText('Ancien lead')).toBeInTheDocument()
  expect(screen.queryByText('Atelier Pivoine')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }))
  await waitFor(() => expect(screen.queryByText('Ancien lead')).not.toBeInTheDocument())
  expect(
    apiFetch.mock.calls.some(([path, opts]) => path.includes('/bulk') && JSON.parse(opts.body).action === 'restore'),
  ).toBe(true)
})

it('exporte les lignes filtrées et les colonnes affichées depuis le bouton de l’en-tête', async () => {
  const exportRef = { current: null as (() => void) | null }
  setup({ project: 'ARROW', exportRef })
  fireEvent.click(screen.getByRole('button', { name: /Colonnes/ }))
  fireEvent.click(screen.getByLabelText(/Secteur/))
  exportRef.current?.()
  expect(exportToCsv).toHaveBeenLastCalledWith('crm-leads.csv', expect.arrayContaining(['Lead', 'Secteur']), [
    expect.arrayContaining(['Atelier Pivoine']),
  ])
  const calls = vi.mocked(exportToCsv).mock.calls
  const [, headers, rows] = calls[calls.length - 1]
  expect(headers).toHaveLength(8)
  expect(rows[0]).toHaveLength(8)
})
