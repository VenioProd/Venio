import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const services = vi.hoisted(() => ({
  listWebhooks: vi.fn(),
  createWebhook: vi.fn(),
  updateWebhook: vi.fn(),
  rotateWebhookSecret: vi.fn(),
  testWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
  listDeliveries: vi.fn(),
  getDelivery: vi.fn(),
  replayDelivery: vi.fn(),
}))

vi.mock('../services/webhooks', () => services)
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

import DeliveryLog from '../pages/admin/webhooks/DeliveryLog'
import type { WebhookEndpoint } from '../pages/admin/webhooks/types'

const endpoint = {
  _id: 'e1',
  name: 'Kuro',
  url: 'https://kuro.example.test/hooks',
  eventTypes: [],
  isActive: true,
  consecutiveFailures: 0,
  disabledAt: null,
  disabledReason: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-20T10:00:00.000Z',
} as WebhookEndpoint

const delivered = {
  _id: 'd1',
  endpoint: 'e1',
  eventId: 'evt-1',
  eventType: 'TICKET_CREATED',
  status: 'DELIVERED' as const,
  attempts: [{ at: '2026-08-26T10:00:00.000Z', httpStatus: 200, error: '', durationMs: 34 }],
  nextRetryAt: null,
  createdAt: '2026-08-26T10:00:00.000Z',
}

const failed = {
  ...delivered,
  _id: 'd2',
  eventId: 'evt-2',
  status: 'FAILED' as const,
  attempts: [{ at: '2026-08-26T11:00:00.000Z', httpStatus: 500, error: 'HTTP 500', durationMs: 120 }],
}

beforeEach(() => {
  vi.clearAllMocks()
  services.listDeliveries.mockResolvedValue({
    deliveries: [delivered, failed],
    total: 2,
    page: 1,
    pages: 1,
  })
  services.getDelivery.mockResolvedValue({
    delivery: { ...failed, payload: { id: 'evt-2', type: 'TICKET_CREATED', title: 'Ticket' } },
  })
})

function renderLog() {
  return render(<DeliveryLog endpoints={[endpoint]} selected={endpoint} onSelect={vi.fn()} />)
}

describe('journal des livraisons', () => {
  it('charge le journal de l’endpoint sélectionné', async () => {
    renderLog()

    await waitFor(() => expect(services.listDeliveries).toHaveBeenCalledWith('e1', { page: 1 }))
    expect(await screen.findByText('evt-1')).toBeInTheDocument()
    // Les libellés de statut existent aussi dans le filtre : on cible la table.
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Livré')).toBeInTheDocument()
    expect(table.getByText('Échoué')).toBeInTheDocument()
  })

  it('filtre par statut', async () => {
    renderLog()
    await screen.findByText('evt-1')

    fireEvent.change(screen.getByLabelText(/Statut/i), { target: { value: 'FAILED' } })

    await waitFor(() => expect(services.listDeliveries).toHaveBeenLastCalledWith('e1', { page: 1, status: 'FAILED' }))
  })

  it('ouvre le détail avec le payload et les tentatives', async () => {
    renderLog()
    await screen.findByText('evt-2')

    fireEvent.click(screen.getAllByRole('button', { name: /Détail/i })[1]!)

    await waitFor(() => expect(services.getDelivery).toHaveBeenCalledWith('d2'))
    expect(await screen.findByText(/"type": "TICKET_CREATED"/)).toBeInTheDocument()
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument()
  })

  it('rejoue une livraison et rafraîchit le journal', async () => {
    services.replayDelivery.mockResolvedValue({
      delivery: { ...failed, _id: 'd3' },
      outcome: { ok: true, httpStatus: 200, error: '', durationMs: 20, status: 'DELIVERED' },
    })
    renderLog()
    await screen.findByText('evt-2')

    fireEvent.click(screen.getAllByRole('button', { name: /Rejouer/i })[1]!)

    await waitFor(() => expect(services.replayDelivery).toHaveBeenCalledWith('d2'))
    await waitFor(() => expect(services.listDeliveries).toHaveBeenCalledTimes(2))
  })

  it('invite à choisir un endpoint quand aucun n’est sélectionné', () => {
    render(<DeliveryLog endpoints={[endpoint]} selected={null} onSelect={vi.fn()} />)

    expect(screen.getByText(/Sélectionnez un endpoint/i)).toBeInTheDocument()
    expect(services.listDeliveries).not.toHaveBeenCalled()
  })
})
