import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ForecastResponse, PilotageResponse } from '../types/pilotage.types'

const services = vi.hoisted(() => ({
  fetchPilotage: vi.fn(),
  fetchForecast: vi.fn(),
  fetchGoals: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
}))

vi.mock('../services/pilotage', () => services)
vi.mock('../lib/api', () => ({ apiFetch: vi.fn().mockResolvedValue({ users: [] }) }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'me', role: 'ADMIN' } }) }))

import ForecastSection from '../pages/admin/analytics/crm/ForecastSection'
import PilotageSection from '../pages/admin/analytics/crm'

const bucket = (count = 0, gross = 0, weighted = 0) => ({ count, gross, weighted })

const forecast: ForecastResponse = {
  currency: 'EUR',
  timeZone: 'Europe/Paris',
  from: '2026-11',
  months: [
    {
      month: '2026-11',
      openCount: 3,
      gross: 20300,
      weighted: 12485,
      categories: { committed: bucket(1, 14500, 10875), probable: bucket(), pipeline: bucket(2, 5800, 1610) },
      wonCount: 2,
      wonAmount: 9000,
      goal: null,
    },
  ],
  overdue: bucket(1, 2600, 650),
  unscheduled: bucket(),
  totals: { openCount: 10, gross: 69000, weighted: 38145, wonCount: 2, wonAmount: 9000 },
  entity: null,
  userId: null,
}

const pilotage = {
  period: '90d',
  since: '2026-08-16',
  funnel: { stages: [], total: 19 },
  velocity: { stages: [], cycle: { medianDays: null, averageDays: null, samples: 0 } },
  losses: { total: 2, unspecified: 0, byReason: [], byStage: [] },
  revenue: {
    declaredBudget: 83900,
    linkedProjects: 0,
    signed: 0,
    collected: 0,
    documents: 0,
  },
  pipeline: { total: 38145, stages: [], withoutBudget: 0, cohortSize: 19, reliable: true },
  bySource: [],
  byOwner: null,
  coverage: { total: 19, withHistory: 2, withoutHistory: 17, ratio: 0.1 },
} as unknown as PilotageResponse

beforeEach(() => {
  vi.clearAllMocks()
  services.fetchForecast.mockResolvedValue(forecast)
  services.fetchPilotage.mockResolvedValue(pilotage)
  services.fetchGoals.mockResolvedValue([])
})

describe('Prévisions et objectifs — écran', () => {
  it('porte un seul titre de page et des gélules de période à état pressé', async () => {
    render(<PilotageSection />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Prévisions et objectifs' })).toBeInTheDocument()
    const periods = screen.getByRole('group', { name: /Période/ })
    await waitFor(() =>
      expect(within(periods).getByRole('button', { name: '90 j' })).toHaveAttribute('aria-pressed', 'true'),
    )
    expect(within(periods).getByRole('button', { name: '30 j' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(within(periods).getByRole('button', { name: '30 j' }))
    await waitFor(() =>
      expect(within(periods).getByRole('button', { name: '30 j' })).toHaveAttribute('aria-pressed', 'true'),
    )
  })

  it('les tuiles reprennent les totaux du serveur, sans chiffre calculé ailleurs', async () => {
    render(<ForecastSection />)
    const tiles = await screen.findByRole('group', { name: 'Chiffres clés des prévisions' })
    const text = tiles.textContent ?? ''
    expect(text).toMatch(/38\s145/)
    expect(text).toMatch(/69\s000/)
    expect(text).toMatch(/9\s000/)
    expect(text).toMatch(/650/)
    expect(within(tiles).getByText('pondéré sur 10 leads ouverts')).toBeInTheDocument()
    expect(within(tiles).getByText('gagné, 2 leads')).toBeInTheDocument()
    expect(within(tiles).getByText('1 lead dont la clôture prévue est passée')).toBeInTheDocument()
  })

  it('le graphique et la barre gagné + pondéré ont un nom accessible, le tableau porte les mêmes données', async () => {
    const { container } = render(<ForecastSection />)
    await screen.findByRole('group', { name: 'Chiffres clés des prévisions' })
    expect(
      screen.getByRole('img', { name: 'Montant pondéré et nombre de leads ouverts, mois par mois' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /gagnés et .* pondérés/ })).toBeInTheDocument()
    expect(container.querySelector('.forecast-table')).not.toBeNull()
    // Les cartes sont des sections nommées, sous un titre de bloc.
    expect(screen.getByRole('heading', { level: 2, name: 'Prévisions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Objectifs' })).toBeInTheDocument()
  })
})
