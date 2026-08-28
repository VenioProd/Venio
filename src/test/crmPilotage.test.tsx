import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { PilotageResponse } from '../types/pilotage.types'

const services = vi.hoisted(() => ({ fetchPilotage: vi.fn() }))
vi.mock('../services/pilotage', () => services)
vi.mock('../lib/api', () => ({ apiFetch: vi.fn().mockResolvedValue({ users: [] }) }))

import PilotageSection from '../pages/admin/analytics/crm'
import LostReasonDialog from '../pages/admin/crm-board/LostReasonDialog'

function response(overrides: Partial<PilotageResponse> = {}): PilotageResponse {
  return {
    period: '90d',
    since: '2026-06-01T00:00:00.000Z',
    funnel: {
      total: 10,
      stages: [
        { stage: 'LEAD', count: 10, rateFromPrevious: null },
        { stage: 'QUALIFIED', count: 6, rateFromPrevious: 0.6 },
        { stage: 'CONTACTED', count: 5, rateFromPrevious: 5 / 6 },
        { stage: 'DEMO', count: 2, rateFromPrevious: 0.4 },
        { stage: 'PROPOSAL', count: 2, rateFromPrevious: 1 },
        { stage: 'WON', count: 1, rateFromPrevious: 0.5 },
      ],
    },
    velocity: {
      stages: [
        { stage: 'LEAD', medianDays: 2, averageDays: 3.4, samples: 8 },
        { stage: 'QUALIFIED', medianDays: null, averageDays: null, samples: 0 },
        { stage: 'CONTACTED', medianDays: null, averageDays: null, samples: 0 },
        { stage: 'DEMO', medianDays: null, averageDays: null, samples: 0 },
        { stage: 'PROPOSAL', medianDays: null, averageDays: null, samples: 0 },
        { stage: 'WON', medianDays: null, averageDays: null, samples: 0 },
      ],
      cycle: { medianDays: 21, averageDays: 28.5, samples: 3 },
    },
    losses: {
      total: 4,
      unspecified: 1,
      byReason: [
        { reason: 'Prix', count: 3, share: 0.75 },
        { reason: 'NON_RENSEIGNE', count: 1, share: 0.25 },
      ],
      byStage: [{ stage: 'PROPOSAL', count: 4 }],
    },
    bySource: [
      { key: 'Ads', total: 6, won: 1, lost: 3, active: 2, winRate: 0.25, wonBudget: 4000 },
      { key: 'NON_RENSEIGNE', total: 4, won: 0, lost: 1, active: 3, winRate: 0, wonBudget: 0 },
    ],
    byOwner: null,
    coverage: { total: 10, withHistory: 8, withoutHistory: 2, ratio: 0.8 },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  services.fetchPilotage.mockResolvedValue(response())
})

describe('PilotageSection', () => {
  it("affiche l'entonnoir avec les taux de passage", async () => {
    render(<PilotageSection />)
    await screen.findByText('Entonnoir — 10 leads')

    expect(screen.getByText('Qualifié')).toBeInTheDocument()
    expect(screen.getByText('60 %')).toBeInTheDocument()
    expect(screen.getByText('40 %')).toBeInTheDocument()
  })

  it("signale les leads dont le parcours n'est pas journalisé", async () => {
    render(<PilotageSection />)
    await screen.findByText(/2 leads sur 10/)
    expect(screen.getByText(/pas dans les durées/)).toBeInTheDocument()
  })

  it("tait l'avertissement quand tout est journalisé", async () => {
    services.fetchPilotage.mockResolvedValue(
      response({ coverage: { total: 10, withHistory: 10, withoutHistory: 0, ratio: 1 } }),
    )
    render(<PilotageSection />)
    await screen.findByText('Entonnoir — 10 leads')
    expect(screen.queryByText(/sans que leur parcours/)).not.toBeInTheDocument()
  })

  it('met la médiane du cycle en avant et garde la moyenne à côté', async () => {
    render(<PilotageSection />)
    await screen.findByText('21 j')
    expect(screen.getByText(/moyenne 28.5 j/)).toBeInTheDocument()
  })

  it('nomme les motifs manquants au lieu de les taire', async () => {
    render(<PilotageSection />)
    await screen.findByText('Affaires perdues — 4')
    expect(screen.getAllByText('Non renseigné').length).toBeGreaterThan(0)
    expect(screen.getByText(/25 % des pertes n'ont pas de motif/)).toBeInTheDocument()
  })

  it('masque la ventilation par commercial quand le serveur ne la sert pas', async () => {
    render(<PilotageSection />)
    await screen.findByText('Par source')
    expect(screen.queryByText('Par commercial')).not.toBeInTheDocument()
  })

  it('affiche la ventilation par commercial quand elle est servie', async () => {
    services.fetchPilotage.mockResolvedValue(
      response({
        byOwner: [{ key: 'u1', total: 3, won: 1, lost: 1, active: 1, winRate: 0.5, wonBudget: 900 }],
      }),
    )
    render(<PilotageSection />)
    await screen.findByText('Par commercial')
  })

  it('recharge en changeant de période', async () => {
    render(<PilotageSection />)
    await screen.findByText('Par source')

    fireEvent.click(screen.getByRole('button', { name: '30 j' }))
    await waitFor(() => expect(services.fetchPilotage).toHaveBeenCalledWith('30d'))
  })

  it("affiche l'erreur plutôt qu'une page vide", async () => {
    services.fetchPilotage.mockRejectedValue(new Error('Boom'))
    render(<PilotageSection />)
    await screen.findByText('Boom')
  })
})

describe('LostReasonDialog', () => {
  it('renvoie le motif choisi et la précision', async () => {
    const onConfirm = vi.fn()
    render(
      <LostReasonDialog
        company="Acme"
        reasons={['Prix', 'Délai']}
        saving={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/Ce qui a fait basculer/), {
      target: { value: '20 % trop cher' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Marquer perdue' }))

    expect(onConfirm).toHaveBeenCalledWith({ lostReason: 'Prix', lostComment: '20 % trop cher' })
  })

  it('propose les motifs configurés', () => {
    render(
      <LostReasonDialog
        company="Acme"
        reasons={['Concurrent']}
        saving={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    const dialog = screen.getByText('Affaire perdue — Acme').closest('.crm-modal')!
    expect(within(dialog as HTMLElement).getByText('Concurrent')).toBeInTheDocument()
  })
})
