import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../../../types/auth.types'
import type { HomeQueue, QueueItem } from '../../../../services/home'
import { apiFetch } from '../../../../lib/api'
import Accueil, { UNDO_DELAY_MS } from '..'

let currentUser: User
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ user: currentUser }) }))
vi.mock('../../../../lib/api', () => ({ apiFetch: vi.fn() }))
const fetchMock = vi.mocked(apiFetch)

const yesterday = new Date(Date.now() - 86_400_000).toISOString()

function item(partial: Partial<QueueItem> & Pick<QueueItem, 'id' | 'kind' | 'title'>): QueueItem {
  return {
    sourceId: partial.id.split(':')[1],
    subtitle: null,
    priority: 'NORMAL',
    status: 'OPEN',
    dueAt: null,
    slaDueAt: null,
    overdue: false,
    dueToday: false,
    createdAt: yesterday,
    score: 50,
    link: null,
    actions: [],
    meta: {},
    ...partial,
  }
}

const queue: HomeQueue = {
  items: [
    item({
      id: 'decision:d1',
      kind: 'decision',
      title: 'Budget refonte',
      priority: 'URGENT',
      dueAt: yesterday,
      overdue: true,
      score: 90,
      link: '/admin/decisions',
      actions: ['approve', 'improve', 'reject'],
      meta: { category: 'BUDGET' },
    }),
    item({
      id: 'task:t1',
      kind: 'task',
      title: 'Envoyer le bilan',
      dueAt: yesterday,
      overdue: true,
      score: 70,
      link: '/admin/projets/p1',
      actions: ['complete', 'postpone', 'open'],
      meta: { source: 'PROJECT', projectId: 'p1' },
    }),
    item({
      id: 'ticket:k1',
      kind: 'ticket',
      title: 'Export PDF tronqué',
      score: 40,
      link: '/admin/demandes/equipe',
      actions: ['open'],
    }),
  ],
  counts: { all: 3, decision: 1, task: 1, ticket: 1, request: 0, crm: 0, dev: 0 },
  overdue: 2,
  dueToday: 0,
  kinds: ['decision', 'task', 'ticket'],
  generatedAt: new Date().toISOString(),
}

function routeApi(overrides: Record<string, unknown> = {}) {
  fetchMock.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (options?.method && options.method !== 'GET') return {}
    const routes: Record<string, unknown> = {
      '/api/admin/home/queue': queue,
      '/api/admin/workspace/overview': {
        kpis: [],
        overdue: [],
        week: [],
        pinned: [{ _id: 'p1', title: 'Pipeline T4', link: '/admin/crm' }],
        activity: [
          {
            _id: 'n1',
            title: 'Groupe Valcourt',
            message: 'a commenté les maquettes',
            link: '/admin/inbox',
            createdAt: new Date().toISOString(),
            isRead: false,
          },
          { _id: 'n2', title: 'Déjà lue', message: '', link: '', createdAt: yesterday, isRead: true },
        ],
      },
      '/api/admin/projects/overview': {
        pulse: {
          total: 3,
          active: 2,
          done: 1,
          late: 1,
          atRisk: 1,
          dueIn7Days: 1,
          dueIn48h: 0,
          toBill: 0,
          budget: { total: 0, invoiced: 0, pct: null },
          load: { pct: null, overloaded: 0 },
        },
        queue: [],
        upcoming: [],
        workload: [],
        items: [
          {
            _id: 'pr1',
            name: 'Identité et landing',
            status: 'EN_COURS',
            overdueDays: 3,
            progress: 94,
            client: { _id: 'c', name: 'Studio Fenwick' },
            endDate: yesterday,
          },
          {
            _id: 'pr2',
            name: 'Dans les temps',
            status: 'EN_COURS',
            overdueDays: 0,
            progress: 20,
            client: null,
            endDate: null,
          },
        ],
      },
      '/api/admin/dashboard': { pipelineValue: 126400, totalRevenue: 48320, activeProjectCount: 2 },
      '/api/admin/tickets/stats': { open: 10, inProgress: 2, total: 12 },
      ...overrides,
    }
    const key = Object.keys(routes).find((k) => path.startsWith(k))
    if (key) return routes[key]
    if (path.startsWith('/api/admin/calendar/events')) return { events: [] }
    if (path.startsWith('/api/admin/education/sessions')) return { sessions: [] }
    if (path.startsWith('/api/admin/education/calendar')) return { events: [] }
    throw new Error(`unexpected ${path}`)
  })
}

const mount = () =>
  render(
    <MemoryRouter>
      <Accueil />
    </MemoryRouter>,
  )

const queueCard = () => screen.getByRole('region', { name: /File d’actions/ })

beforeEach(() => {
  vi.resetAllMocks()
  currentUser = { _id: 'u1', name: 'Raphaël Bentvelzen', email: 'r@v.test', role: 'SUPER_ADMIN', permissions: [] }
  routeApi()
})
afterEach(() => vi.useRealTimers())

describe('Accueil', () => {
  it('annonce le nombre d’éléments en attente, dont en retard', async () => {
    mount()
    expect(
      await screen.findByRole('heading', { level: 1, name: /3 éléments attendent votre action/ }),
    ).toBeInTheDocument()
    expect(screen.getByText(/dont 2 en retard et 0 à traiter aujourd’hui/)).toBeInTheDocument()
  })

  it('filtre la file par type, avec les seuls types autorisés par le serveur', async () => {
    mount()
    await screen.findByText('Budget refonte')
    const filters = within(queueCard()).getByRole('group', { name: 'Filtrer par type' })
    expect(
      within(filters)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Tout3', 'Décisions1', 'Tâches en retard1', 'Tickets1'])
    fireEvent.click(within(filters).getByRole('button', { name: /Tickets/ }))
    expect(screen.queryByText('Budget refonte')).not.toBeInTheDocument()
    expect(screen.getByText('Export PDF tronqué')).toBeInTheDocument()
    expect(within(queueCard()).getByRole('link', { name: 'Ouvrir « Export PDF tronqué »' })).toHaveAttribute(
      'href',
      '/admin/demandes/equipe',
    )
  })

  it('diffère la validation de 5 s et permet de l’annuler', async () => {
    mount()
    await screen.findByText('Budget refonte')
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(screen.queryByText('Budget refonte', { selector: 'b' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Décision validée')

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    act(() => {
      vi.advanceTimersByTime(UNDO_DELAY_MS + 100)
    })
    expect(fetchMock).not.toHaveBeenCalledWith('/api/admin/decisions/d1/approve', expect.anything())
    expect(screen.getByText('Budget refonte', { selector: 'b' })).toBeInTheDocument()
  })

  it('envoie le refus une fois le délai écoulé', async () => {
    mount()
    await screen.findByText('Budget refonte')
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }))
    expect(fetchMock).not.toHaveBeenCalledWith('/api/admin/decisions/d1/reject', expect.anything())
    await act(async () => {
      vi.advanceTimersByTime(UNDO_DELAY_MS)
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/decisions/d1/reject',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('termine et reporte une tâche sur sa route d’origine', async () => {
    mount()
    await screen.findByText('Envoyer le bilan')
    fireEvent.click(screen.getByRole('button', { name: 'Reporter « Envoyer le bilan » à demain' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/projects/p1/tasks/t1',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    )
    const body = JSON.parse(
      (fetchMock.mock.calls.find((c) => c[0] === '/api/admin/projects/p1/tasks/t1')![1] as { body: string }).body,
    )
    expect(new Date(body.dueDate).getTime()).toBeGreaterThan(Date.now())
    expect(await screen.findByText('« Envoyer le bilan » est reportée à demain.')).toBeInTheDocument()
  })

  it('remet la tâche dans la file si l’écriture échoue', async () => {
    mount()
    await screen.findByText('Envoyer le bilan')
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('500')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Terminer « Envoyer le bilan »' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('n’a pas pu être enregistrée')
    expect(screen.getByText('Envoyer le bilan')).toBeInTheDocument()
  })

  it('n’affiche pas d’action de décision sans le droit de trancher', async () => {
    routeApi({
      '/api/admin/home/queue': {
        ...queue,
        items: queue.items.slice(1),
        kinds: ['task', 'ticket'],
        counts: { ...queue.counts, all: 2, decision: 0 },
      },
    })
    currentUser = { ...currentUser, role: 'VIEWER' }
    mount()
    await screen.findByText('Envoyer le bilan')
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument()
    expect(within(queueCard()).queryByRole('button', { name: /Décisions/ })).not.toBeInTheDocument()
  })

  it('montre le pouls, les notifications non lues, les projets en retard et les épinglés', async () => {
    mount()
    const pulse = await screen.findByRole('region', { name: 'Pouls' })
    await waitFor(() => expect(within(pulse).getAllByRole('link')).toHaveLength(5))
    expect(within(pulse).getByRole('link', { name: /Tickets ouverts/ })).toHaveTextContent('12')

    const since = screen.getByRole('region', { name: /Depuis votre dernière visite/ })
    expect(within(since).getByText('Groupe Valcourt')).toBeInTheDocument()
    expect(within(since).queryByText('Déjà lue')).not.toBeInTheDocument()

    const watch = await screen.findByRole('region', { name: /Projets à surveiller/ })
    await within(watch).findByText('Identité et landing')
    expect(within(watch).queryByText('Dans les temps')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pipeline T4' })).toHaveAttribute('href', '/admin/crm')
  })

  it('n’affiche ni grille personnalisable ni bloc décoratif', async () => {
    mount()
    await screen.findByText('Budget refonte')
    expect(screen.queryByRole('button', { name: /Personnaliser/ })).not.toBeInTheDocument()
  })
})
