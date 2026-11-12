import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CrmBoard from './index'
import PipelineColumn from './PipelineColumn'
import LeadFormPanel from './LeadFormPanel'
import { apiFetch } from '../../../lib/api'
import { DEFAULT_WORKLIST_THRESHOLDS, EMPTY_FORM, leadEntity, parseEntityParam } from './constants'
import { DEFAULT_FOLLOW_UP } from './worklist/helpers'
import type { Lead } from '../../../types/crm.types'
import { fetchPilotage } from '../../../services/pilotage'

/** Chantier 3A — entité du groupe dans le board CRM : filtre, badge, formulaire. */

vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn() }))
const scope = vi.hoisted(() => ({ crmEntities: [] as string[] }))
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', role: 'SUPER_ADMIN', crmEntities: scope.crmEntities } }),
}))
vi.mock('../../../components/admin/InteractionTimeline', () => ({ default: () => <p>Interaction timeline</p> }))
vi.mock('../../../components/admin/RevenueChain', () => ({ default: () => <p>Revenue chain</p> }))

const arrow: Lead = { _id: 'lead-arrow', company: 'École Arrow', status: 'LEAD', entity: 'ARROW' }
const decisio: Lead = { _id: 'lead-decisio', company: 'Cabinet Decisio', status: 'LEAD', entity: 'DECISIO' }
const legacy: Lead = { _id: 'lead-legacy', company: 'Ancien client', status: 'LEAD' }

beforeEach(() => {
  scope.crmEntities = []
  vi.mocked(apiFetch).mockReset()
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    if (path === '/api/admin/crm/pipeline') return { columns: [{ status: 'LEAD', leads: [arrow, decisio, legacy] }] }
    if (path === '/api/admin/admins') return { users: [] }
    if (path === '/api/admin/crm/worklist')
      return {
        groups: { overdue: [arrow, decisio, legacy], today: [], upcoming: [], drifting: [] },
        counts: { overdue: 3, today: 0, upcoming: 0, drifting: 0 },
        thresholds: DEFAULT_WORKLIST_THRESHOLDS,
        followUp: DEFAULT_FOLLOW_UP,
        lostReasons: [],
      }
    if (path === '/api/admin/crm/views') return { items: [] }
    throw new Error(`Unexpected API request: ${path}`)
  })
})

const renderBoard = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <CrmBoard />
    </MemoryRouter>,
  )

const entitySelect = (container: HTMLElement) =>
  container.querySelector('.crm-entity-filter select') as HTMLSelectElement

describe('constantes / entité', () => {
  it('un lead sans entité compte comme Venio ; ?entity= inconnu est ignoré', () => {
    expect(leadEntity(legacy)).toBe('VENIO')
    expect(leadEntity(decisio)).toBe('DECISIO')
    expect(leadEntity({ entity: 'NOPE' })).toBe('VENIO')
    expect(parseEntityParam('FORMATIO')).toBe('FORMATIO')
    expect(parseEntityParam('NOPE')).toBe('')
    expect(parseEntityParam(null)).toBe('')
  })
})

describe('board CRM / filtre par entité', () => {
  it('le filtre restreint la liste à l’entité choisie (Venio inclut les leads sans entité)', async () => {
    const { container } = renderBoard('/admin/crm')
    expect(await screen.findByText('École Arrow')).toBeInTheDocument()
    expect(screen.getByText('Cabinet Decisio')).toBeInTheDocument()
    const select = entitySelect(container)
    expect(select).not.toBeNull()
    expect(select.value).toBe('')

    fireEvent.change(select, { target: { value: 'ARROW' } })
    await waitFor(() => expect(screen.queryByText('Cabinet Decisio')).toBeNull())
    expect(screen.getByText('École Arrow')).toBeInTheDocument()

    fireEvent.change(entitySelect(container), { target: { value: 'VENIO' } })
    await waitFor(() => expect(screen.getByText('Ancien client')).toBeInTheDocument())
    expect(screen.queryByText('École Arrow')).toBeNull()
  })

  it('?entity= dans l’URL s’applique au Kanban et à la file de travail', async () => {
    const kanban = renderBoard('/admin/crm?mode=kanban&entity=DECISIO')
    expect(await screen.findByText('Cabinet Decisio')).toBeInTheDocument()
    expect(screen.queryByText('École Arrow')).toBeNull()
    expect(entitySelect(kanban.container).value).toBe('DECISIO')
    kanban.unmount()

    const file = renderBoard('/admin/crm?mode=file&entity=ARROW')
    expect(await screen.findByText('École Arrow')).toBeInTheDocument()
    expect(screen.queryByText('Cabinet Decisio')).toBeNull()
    expect(screen.queryByText('Ancien client')).toBeNull()
    file.unmount()
  })
})

describe('service pilotage / ?entity=', () => {
  it('ajoute l’entité à la requête seulement quand elle est choisie', async () => {
    vi.mocked(apiFetch).mockResolvedValue({})
    await fetchPilotage('30d')
    await fetchPilotage('ytd', 'CREATIO')
    expect(vi.mocked(apiFetch).mock.calls.map(([path]) => path)).toEqual([
      '/api/admin/crm/pilotage?period=30d',
      '/api/admin/crm/pilotage?period=ytd&entity=CREATIO',
    ])
  })
})

describe('carte Kanban / badge entité', () => {
  it('affiche l’entité du lead, Venio par défaut', () => {
    const props = {
      admins: [],
      adminsById: {},
      converting: null,
      canManageCrm: false,
      onUpdateLead: vi.fn(),
      onConvertToClient: vi.fn(),
      onDrop: vi.fn(),
      onDragStart: vi.fn(),
      onOpenDetail: vi.fn(),
    }
    const { container } = render(<PipelineColumn column={{ status: 'LEAD', leads: [decisio, legacy] }} {...props} />)
    const pills = [...container.querySelectorAll('.crm-entity-pill')].map((pill) => pill.textContent)
    expect(pills).toEqual(['Decisio', 'Venio'])
  })
})

describe('formulaire lead / sélecteur d’entité', () => {
  it('propose les cinq entités et transmet le choix', () => {
    const onFormChange = vi.fn()
    render(
      <LeadFormPanel
        form={{ ...EMPTY_FORM }}
        admins={[]}
        isSuperAdmin
        canManageCrm
        onFormChange={onFormChange}
        onSubmit={vi.fn()}
      />,
    )
    const select = screen.getByRole('combobox', { name: 'Entité (selon le projet)' })
    for (const label of ['Venio', 'Creatio', 'Decisio', 'Formatio']) {
      expect(within(select).getByRole('option', { name: label })).toBeInTheDocument()
    }
    fireEvent.change(select, { target: { value: 'FORMATIO' } })
    expect(onFormChange).toHaveBeenCalledWith(expect.objectContaining({ entity: 'FORMATIO' }))
  })
})

it('limite le filtre Entité au périmètre CRM du profil', async () => {
  scope.crmEntities = ['ARROW']
  const { container } = renderBoard('/admin/crm')
  await screen.findByText('École Arrow')
  const values = [...entitySelect(container).options].map((option) => option.value)
  expect(values).toEqual(['', 'ARROW'])
})
