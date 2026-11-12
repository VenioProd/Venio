import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import PilotageSection from './index'

vi.mock('../../../../lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ users: [{ _id: 'admin', name: 'Camille' }] }),
}))
vi.mock('../../../../services/pilotage', () => ({
  fetchPilotage: vi.fn().mockResolvedValue({
    funnel: { total: 0, stages: [] },
    velocity: { stages: [], cycle: { medianDays: null, averageDays: null, samples: 0 } },
    losses: { total: 0, unspecified: 0, byReason: [], byStage: [] },
    coverage: { total: 0, withHistory: 0, withoutHistory: 0, ratio: 1 },
    pipeline: { total: 0, stages: [], withoutBudget: 0, cohortSize: 0, reliable: true },
    revenue: { declaredBudget: 0, linkedProjects: 0, signed: 0, collected: 0, documents: 0 },
    bySource: [],
    byOwner: ['external', 'admin', 'unknown'].map((key) => ({
      key,
      ownerName: key === 'external' ? 'Samira' : undefined,
      total: 1,
      won: 0,
      lost: 0,
      active: 1,
      winRate: null,
      wonBudget: 0,
      wonSigned: 0,
    })),
  }),
}))

it('préfère le nom API, résout les admins connus et masque les identifiants inconnus', async () => {
  render(<PilotageSection />)
  expect(await screen.findByText('Samira')).toBeInTheDocument()
  expect(screen.getByText('Camille')).toBeInTheDocument()
  expect(screen.getByText('Commercial externe nown')).toBeInTheDocument()
  expect(screen.queryByText('unknown')).toBeNull()
})
