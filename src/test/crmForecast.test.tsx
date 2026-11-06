import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ForecastBucket, ForecastMonth, ForecastResponse, PilotageResponse } from '../types/pilotage.types'

const services = vi.hoisted(() => ({
  fetchPilotage: vi.fn(),
  fetchForecast: vi.fn(),
  fetchGoals: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
}))
const auth = vi.hoisted(() => ({ role: 'SUPER_ADMIN' }))

vi.mock('../services/pilotage', () => services)
vi.mock('../lib/api', () => ({ apiFetch: vi.fn().mockResolvedValue({ users: [{ _id: 'u1', name: 'Alice', email: 'a@x.fr', role: 'COMMERCIAL' }] }) }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'me', role: auth.role } }) }))

import ForecastSection from '../pages/admin/analytics/crm/ForecastSection'
import PilotageSection from '../pages/admin/analytics/crm'

const bucket = (count = 0, gross = 0, weighted = 0): ForecastBucket => ({ count, gross, weighted })

function month(overrides: Partial<ForecastMonth> = {}): ForecastMonth {
  return {
    month: '2026-11',
    openCount: 2,
    gross: 3000,
    weighted: 2100,
    categories: { committed: bucket(1, 2000, 1600), probable: bucket(1, 1000, 500), pipeline: bucket() },
    wonCount: 1,
    wonAmount: 2500,
    goal: null,
    ...overrides,
  }
}

function forecast(overrides: Partial<ForecastResponse> = {}): ForecastResponse {
  return {
    currency: 'EUR',
    timeZone: 'Europe/Paris',
    from: '2026-11',
    months: [
      month({
        goal: {
          _id: 'g1',
          entity: null,
          userId: null,
          amountTarget: 10000,
          wonCountTarget: 4,
          amountProgress: 0.25,
          countProgress: 0.25,
          projectedAmount: 4600,
          projectedProgress: 0.46,
        },
      }),
      month({ month: '2026-12', openCount: 0, gross: 0, weighted: 0, wonCount: 0, wonAmount: 0, categories: { committed: bucket(), probable: bucket(), pipeline: bucket() } }),
    ],
    overdue: bucket(),
    unscheduled: bucket(),
    totals: { openCount: 2, gross: 3000, weighted: 2100, wonCount: 1, wonAmount: 2500 },
    entity: null,
    userId: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.role = 'SUPER_ADMIN'
  services.fetchForecast.mockResolvedValue(forecast())
  services.fetchGoals.mockResolvedValue([])
  services.createGoal.mockResolvedValue({ goal: {} })
  services.updateGoal.mockResolvedValue({ goal: {} })
  services.deleteGoal.mockResolvedValue({ success: true })
})

describe('ForecastSection', () => {
  it('affiche le tableau par mois : ouvertes, brut, pondéré, réalisé, objectif', async () => {
    const { container } = render(<ForecastSection />)
    await screen.findByText('Prévisions')

    const table = within(container.querySelector('.forecast-table') as HTMLElement)
    const rows = table.getAllByRole('row')
    // en-tête + 2 mois
    expect(rows).toHaveLength(3)
    const november = within(rows[1]!)
    expect(november.getByText(/3[\s\u202f\u00a0]000/)).toBeInTheDocument()
    expect(november.getByText(/2[\s\u202f\u00a0]100/)).toBeInTheDocument()
    expect(november.getByText(/2[\s\u202f\u00a0]500/)).toBeInTheDocument()
    expect(november.getByText(/25 % de/)).toBeInTheDocument()
    expect(within(rows[2]!).getByText("Pas d'objectif")).toBeInTheDocument()
  })

  it('dessine une barre par mois avec le repère d’objectif seulement quand il existe', async () => {
    const { container } = render(<ForecastSection />)
    await screen.findByText('Prévisions')
    const bars = container.querySelectorAll('.forecast-bar-row')
    expect(bars).toHaveLength(2)
    expect(bars[0]!.querySelector('.forecast-bar-goal')).not.toBeNull()
    expect(bars[1]!.querySelector('.forecast-bar-goal')).toBeNull()
  })

  it('recharge selon l’entité et l’horizon', async () => {
    render(<ForecastSection />)
    await screen.findByText('Prévisions')
    expect(services.fetchForecast).toHaveBeenLastCalledWith({ months: 6 })

    fireEvent.change(screen.getByRole('combobox', { name: /Entité du groupe/ }), { target: { value: 'ARROW' } })
    await waitFor(() => expect(services.fetchForecast).toHaveBeenLastCalledWith({ months: 6, entity: 'ARROW' }))

    fireEvent.click(screen.getByRole('button', { name: '12 mois' }))
    await waitFor(() => expect(services.fetchForecast).toHaveBeenLastCalledWith({ months: 12, entity: 'ARROW' }))
  })

  it('signale les retards et les affaires sans date, et se tait sinon', async () => {
    services.fetchForecast.mockResolvedValue(forecast({ overdue: bucket(2, 900, 450), unscheduled: bucket(1, 100, 50) }))
    const { unmount } = render(<ForecastSection />)
    await screen.findByText(/2 affaires ouvertes ont une clôture prévue dépassée/)
    expect(screen.getByText(/1 affaire ouverte n'a pas de date de clôture prévue/)).toBeInTheDocument()
    unmount()

    services.fetchForecast.mockResolvedValue(forecast())
    render(<ForecastSection />)
    await screen.findByText('Prévisions')
    expect(screen.queryByText(/clôture prévue dépassée/)).not.toBeInTheDocument()
  })

  it('affiche l’erreur plutôt qu’une page vide', async () => {
    services.fetchForecast.mockRejectedValue(new Error('Boom'))
    render(<ForecastSection />)
    await screen.findByText('Boom')
  })
})

describe('Objectifs (administrateurs)', () => {
  it('est masqué à un rôle qui n’administre pas le CRM', async () => {
    auth.role = 'COMMERCIAL'
    render(<ForecastSection />)
    await screen.findByText('Prévisions')
    expect(screen.queryByText('Objectifs mensuels')).not.toBeInTheDocument()
    expect(services.fetchGoals).not.toHaveBeenCalled()
  })

  it('crée un objectif puis recalcule la prévision', async () => {
    render(<ForecastSection />)
    await screen.findByText('Objectifs mensuels')
    expect(services.fetchGoals).toHaveBeenCalledWith({ from: '2026-11', to: '2027-04' })

    fireEvent.change(screen.getByLabelText('Mois'), { target: { value: '2026-12' } })
    fireEvent.change(screen.getByLabelText('CA visé (€)'), { target: { value: '8000' } })
    fireEvent.change(screen.getByLabelText('Gains visés'), { target: { value: '3' } })
    const callsBefore = services.fetchForecast.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() =>
      expect(services.createGoal).toHaveBeenCalledWith({
        period: '2026-12',
        entity: null,
        userId: null,
        amountTarget: 8000,
        wonCountTarget: 3,
      }),
    )
    await waitFor(() => expect(services.fetchForecast.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('modifie les cibles et supprime un objectif', async () => {
    services.fetchGoals.mockResolvedValue([
      { _id: 'g1', period: '2026-11', entity: 'ARROW', userId: 'u1', amountTarget: 10000, wonCountTarget: 4 },
    ])
    render(<ForecastSection />)
    const amount = await screen.findByLabelText('CA visé (€) 2026-11')
    // Nom du commercial : dans la liste déroulante du formulaire et dans la ligne de l'objectif.
    expect(screen.getAllByText('Alice')).toHaveLength(2)

    fireEvent.change(amount, { target: { value: '12000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(services.updateGoal).toHaveBeenCalledWith('g1', { amountTarget: 12000, wonCountTarget: 4 }))

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(services.deleteGoal).toHaveBeenCalledWith('g1'))
  })

  it('affiche le refus du serveur', async () => {
    services.createGoal.mockRejectedValue(new Error('Un objectif existe déjà pour ce mois et ce périmètre'))
    render(<ForecastSection />)
    await screen.findByText('Objectifs mensuels')
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    await screen.findByText('Un objectif existe déjà pour ce mois et ce périmètre')
  })
})

describe('Pilotage — devises et définition du pondéré', () => {
  const pilotage = {
    period: '90d',
    since: '2026-06-01T00:00:00.000Z',
    funnel: { total: 1, stages: [{ stage: 'LEAD', count: 1, rateFromPrevious: null }] },
    velocity: { stages: [], cycle: { medianDays: null, averageDays: null, samples: 0 } },
    losses: { total: 0, unspecified: 0, byReason: [], byStage: [] },
    bySource: [],
    byOwner: null,
    coverage: { total: 1, withHistory: 1, withoutHistory: 0, ratio: 1 },
    revenue: {
      currency: 'EUR',
      declaredBudget: 1000,
      linkedProjects: 1,
      signed: 1200,
      collected: 0,
      documents: 1,
      byCurrency: {
        EUR: { signed: 1200, collected: 0, documents: 1 },
        USD: { signed: 700, collected: 300, documents: 2 },
      },
    },
    pipeline: {
      currency: 'EUR',
      total: 650,
      stages: [{ stage: 'PROPOSAL', count: 1, probability: 0.65, observedRate: 0.5, weighted: 650 }],
      withoutBudget: 0,
      cohortSize: 3,
      reliable: false,
    },
  } as unknown as PilotageResponse

  it('liste les autres devises à part, sans les additionner à l’euro', async () => {
    services.fetchPilotage.mockResolvedValue(pilotage)
    render(<PilotageSection />)
    await screen.findByText(/Autres devises/)
    expect(screen.getByText(/USD — signé/)).toBeInTheDocument()
    expect(screen.getByText(/Valeur pondérée = budget × probabilité/)).toBeInTheDocument()
    expect(screen.queryByText(/Projection à prendre avec précaution/)).not.toBeInTheDocument()
  })
})
