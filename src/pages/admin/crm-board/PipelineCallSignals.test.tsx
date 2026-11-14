import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { apiFetch } from '../../../lib/api'
import type { Lead } from '../../../types/crm.types'
import CrmBoard from '.'
import LeadDetailPage from './LeadDetailPage'
import PipelineColumn, { KANBAN_PREVIEW } from './PipelineColumn'
import RichLeadTable from './rich/RichLeadTable'
import { DEFAULT_WORKLIST_THRESHOLDS } from './constants'
import { DEFAULT_FOLLOW_UP } from './worklist/helpers'

vi.mock('../../../lib/api', async () => ({ ...(await vi.importActual<object>('../../../lib/api')), apiFetch: vi.fn() }))
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', role: 'SUPER_ADMIN', permissions: [] } }),
}))
vi.mock('../../../components/admin/InteractionTimeline', () => ({ default: () => <p>Journal</p> }))
vi.mock('../../../components/admin/RevenueChain', () => ({ default: () => <p>Chaîne</p> }))

type Responder = (path: string) => unknown
let respond: Responder = () => ({})
beforeEach(() => {
  vi.mocked(apiFetch).mockReset()
  vi.mocked(apiFetch).mockImplementation((async (path: string) => respond(path)) as typeof apiFetch)
})
afterEach(cleanup)

const admins = [{ _id: 'u1', name: 'Raphaël B.', email: 'r@x.fr', role: 'SUPER_ADMIN' }]
const now = new Date().toISOString()
const longAgo = new Date(Date.now() - 70 * 86_400_000).toISOString()

function Location() {
  const location = useLocation()
  return <output data-testid="url">{`${location.pathname}${location.search}`}</output>
}

const table = (leads: Lead[]) =>
  render(
    <MemoryRouter initialEntries={['/admin/crm/suivre/pipeline']}>
      <RichLeadTable
        leads={leads}
        admins={admins}
        adminsById={{ u1: admins[0]! }}
        canManageCrm
        currentUserId="u1"
        project=""
        onProjectChange={vi.fn()}
        onOpenLead={vi.fn()}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onError={vi.fn()}
      />
    </MemoryRouter>,
  )

it('pose « analyse à valider » et « répondeur » sur les lignes affichées, lus par identifiants', async () => {
  respond = (path) =>
    path.startsWith('/api/admin/call-desk/lead-signals') ? { analysisReady: ['a'], voicemail: ['b'] } : { items: [] }
  table([
    { _id: 'a', company: 'Menuiserie Dubreuil', status: 'CONTACTED' },
    { _id: 'b', company: 'Garage Lambert', status: 'LEAD' },
    { _id: 'c', company: 'Cèdres', status: 'LEAD' },
  ])
  const row = (company: string) => screen.getByRole('button', { name: new RegExp(company) }).closest('tr')!
  expect(await within(row('Menuiserie Dubreuil')).findByText('Analyse à valider')).toBeInTheDocument()
  expect(within(row('Garage Lambert')).getByText('Répondeur au dernier appel')).toBeInTheDocument()
  expect(within(row('Cèdres')).queryByText(/Analyse à valider|Répondeur/)).toBeNull()
  const requested = vi
    .mocked(apiFetch)
    .mock.calls.map(([path]) => String(path))
    .filter((path) => path.includes('lead-signals'))
  expect(requested).toHaveLength(1)
  expect(new URL(requested[0]!, 'http://x').searchParams.get('ids')!.split(',').sort()).toEqual(['a', 'b', 'c'])
})

it('compte les fiches de chaque vue avec le filtre de la liste, et les gagnés du mois', async () => {
  respond = (path) =>
    path === '/api/admin/crm/views'
      ? {
          items: [
            { _id: 'v1', name: 'Gagnés', owner: 'u1', scope: 'PRIVATE', filters: { status: 'WON' }, columns: [] },
          ],
        }
      : { analysisReady: [], voicemail: [] }
  table([
    { _id: 'a', company: 'A', status: 'DEMO', assignedTo: 'u1', nextActionAt: longAgo, leadTemperature: 'CHAUD' },
    { _id: 'b', company: 'B', status: 'LEAD' },
    { _id: 'c', company: 'C', status: 'WON', budget: 9000, statusChangedAt: now },
    { _id: 'd', company: 'D', status: 'LOST', statusChangedAt: now },
    { _id: 'e', company: 'E', status: 'WON', budget: 4000, statusChangedAt: longAgo },
  ])
  const pills = screen.getByRole('group', { name: 'Vues enregistrées' })
  const count = (name: RegExp) => within(pills).getByRole('button', { name }).textContent?.replace(/\D+/g, ' ').trim()
  expect(count(/^Tous les leads/)).toBe('5')
  expect(count(/^Mes fiches/)).toBe('1')
  expect(count(/^Leads chauds/)).toBe('1')
  expect(count(/^Relances en retard/)).toBe('1')
  expect(count(/^Sans propriétaire/)).toBe('4')
  expect(await within(pills).findByRole('button', { name: /^Gagnés\s*2$/ })).toBeInTheDocument()
  // Archivés : lus seulement à l'ouverture de leur vue, pas de compte.
  expect(within(pills).getByRole('button', { name: 'Archivés' })).toBeInTheDocument()
  const strip = screen.getByRole('region', { name: 'Indicateurs du pipeline' })
  expect(within(strip).getByText('1 gagné')).toBeInTheDocument()
  expect(within(strip).getByText(/^ce mois, 9 000 €, et 1 perdu$/)).toBeInTheDocument()
})

it('Kanban : une colonne longue montre ses premières cartes puis « + n autres », qui la déplie', () => {
  const leads = Array.from({ length: KANBAN_PREVIEW + 2 }, (_, index) => ({
    _id: `l${index}`,
    company: `Fiche ${index}`,
    status: 'LEAD',
    budget: index >= KANBAN_PREVIEW ? 1000 : 0,
  }))
  const props = {
    column: { status: 'LEAD', leads },
    admins: [],
    adminsById: {},
    canManageCrm: true,
    converting: null,
    onUpdateLead: vi.fn(),
    onConvertToClient: vi.fn(),
    onDrop: vi.fn(),
    onDragStart: vi.fn(),
    onOpenDetail: vi.fn(),
    onToggleExpanded: vi.fn(),
  }
  const { rerender } = render(<PipelineColumn {...props} />)
  expect(screen.getByRole('button', { name: `Fiche ${KANBAN_PREVIEW - 1}` })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: `Fiche ${KANBAN_PREVIEW}` })).toBeNull()
  // Le compteur de la colonne reste celui de toutes ses fiches.
  expect(screen.getByRole('group', { name: `Lead, ${KANBAN_PREVIEW + 2} leads` })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^\+ 2 autres leads, 2\s000\s€$/ }))
  expect(props.onToggleExpanded).toHaveBeenCalledTimes(1)
  rerender(<PipelineColumn {...props} expanded />)
  expect(screen.getByRole('button', { name: `Fiche ${KANBAN_PREVIEW + 1}` })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Réduire la colonne' })).toHaveAttribute('aria-expanded', 'true')
})

it('l’adresse /suivre/pipeline/kanban ouvre le Kanban ; la bascule revient au pipeline par ?mode=', async () => {
  respond = (path) => {
    if (path === '/api/admin/crm/pipeline')
      return { columns: [{ status: 'LEAD', leads: [{ _id: 'a', company: 'Atelier', status: 'LEAD' }] }] }
    if (path === '/api/admin/admins') return { users: [] }
    if (path === '/api/admin/crm/worklist')
      return {
        groups: { overdue: [], today: [], upcoming: [], drifting: [] },
        counts: { overdue: 0, today: 0, upcoming: 0, drifting: 0 },
        thresholds: DEFAULT_WORKLIST_THRESHOLDS,
        followUp: DEFAULT_FOLLOW_UP,
        lostReasons: [],
      }
    return { items: [] }
  }
  render(
    <MemoryRouter initialEntries={['/admin/crm/suivre/pipeline/kanban']}>
      <Routes>
        <Route path="/admin/crm/suivre/pipeline/*" element={<CrmBoard />} />
      </Routes>
      <Location />
    </MemoryRouter>,
  )
  expect(await screen.findByRole('group', { name: 'Colonnes du pipeline' })).toBeInTheDocument()
  expect(screen.getByTitle('Vue Kanban')).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByTitle('Tableau enrichi'))
  await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('/admin/crm/suivre/pipeline?mode=liste'))
  expect(screen.queryByRole('group', { name: 'Colonnes du pipeline' })).toBeNull()
})

const leadPage = (lead: Partial<Lead>) =>
  render(
    <MemoryRouter initialEntries={['/admin/crm/leads/a']}>
      <LeadDetailPage
        lead={{ _id: 'a', company: 'Fleuriste Pétale', status: 'CONTACTED', ...lead }}
        admins={[]}
        canManageCrm={false}
        converting={null}
        onClose={vi.fn()}
        onLeadChange={vi.fn()}
        onUpdateLead={vi.fn().mockResolvedValue(undefined)}
        onConvertToClient={vi.fn()}
      />
    </MemoryRouter>,
  )

it('fiche : pays, heure locale et blocage du prospect ; hors plage en bandeau', async () => {
  respond = (path) =>
    path === '/api/admin/call-desk/leads/a/call-check'
      ? { callCheck: { country: 'GP', timeZones: ['America/Guadeloupe'], block: 'OUTSIDE_CALLING_HOURS' } }
      : { duplicates: [], calls: [] }
  leadPage({ contactPhone: '+590690123456' })
  const title = await screen.findByText('Hors plage chez le prospect', { selector: 'strong' })
  expect(title.closest('[role="status"]')).toHaveTextContent('Guadeloupe')
  const row = screen.getByRole('group', { name: 'Pays et heure locale du prospect' })
  expect(row).toHaveTextContent('GP')
  // Le bandeau dit déjà « hors plage » : pas de puce en double.
  expect(within(row).queryByText('Hors plage chez le prospect')).toBeNull()
  cleanup()

  respond = (path) =>
    path === '/api/admin/call-desk/leads/a/call-check'
      ? { callCheck: { country: 'FR', timeZones: ['Europe/Paris'], block: 'NOT_BUSINESS_CONTACT' } }
      : { duplicates: [], calls: [] }
  leadPage({ contactPhone: '+33611111111' })
  const chips = await screen.findByRole('group', { name: 'Pays et heure locale du prospect' })
  expect(within(chips).getByText('Contact pro à confirmer')).toBeInTheDocument()
  expect(screen.queryByText('Hors plage chez le prospect')).toBeNull()
  cleanup()

  // Sans numéro, rien à vérifier : aucune lecture.
  vi.mocked(apiFetch).mockClear()
  leadPage({})
  expect(vi.mocked(apiFetch).mock.calls.some(([path]) => String(path).includes('call-check'))).toBe(false)
})
