import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

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

import Webhooks from '../pages/admin/Webhooks'

const endpoint = {
  _id: 'e1',
  name: 'Kuro',
  url: 'https://kuro.example.test/hooks/venio',
  eventTypes: ['TICKET_CREATED'],
  isActive: true,
  consecutiveFailures: 0,
  disabledAt: null,
  disabledReason: null,
  lastSuccessAt: '2026-08-26T10:00:00.000Z',
  lastFailureAt: null,
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  services.listWebhooks.mockResolvedValue({
    endpoints: [endpoint],
    eventTypes: ['TICKET_CREATED', 'BILLING_INVOICE_CREATED'],
  })
  services.listDeliveries.mockResolvedValue({ deliveries: [], total: 0, page: 1, pages: 1 })
})

function renderPage() {
  return render(
    <MemoryRouter>
      <Webhooks />
    </MemoryRouter>,
  )
}

describe('page admin Webhooks', () => {
  it('liste les endpoints avec leur santé et leur filtre de types', async () => {
    renderPage()

    expect(await screen.findByText('Kuro')).toBeInTheDocument()
    expect(screen.getByText('https://kuro.example.test/hooks/venio')).toBeInTheDocument()
    expect(screen.getByText('Ticket créé')).toBeInTheDocument()
    expect(screen.getByText(/Actif/)).toBeInTheDocument()
  })

  it('affiche « Tous les types » quand aucun filtre n’est posé', async () => {
    services.listWebhooks.mockResolvedValue({
      endpoints: [{ ...endpoint, eventTypes: [] }],
      eventTypes: ['TICKET_CREATED'],
    })
    renderPage()

    expect(await screen.findByText('Tous les types')).toBeInTheDocument()
  })

  it('crée un endpoint et révèle le secret une seule fois', async () => {
    services.createWebhook.mockResolvedValue({ endpoint, secret: 'f'.repeat(64) })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Nouvel endpoint/i }))
    fireEvent.change(screen.getByLabelText(/^Nom/), { target: { value: 'Kuro' } })
    fireEvent.change(screen.getByLabelText(/^URL/), {
      target: { value: 'https://kuro.example.test/hooks/venio' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Créer$/ }))

    await waitFor(() =>
      expect(services.createWebhook).toHaveBeenCalledWith({
        name: 'Kuro',
        url: 'https://kuro.example.test/hooks/venio',
        eventTypes: [],
      }),
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('f'.repeat(64))).toBeInTheDocument()
    expect(within(dialog).getByText(/ne sera plus jamais affiché/i)).toBeInTheDocument()
  })

  it('remonte l’erreur du serveur sur une URL refusée', async () => {
    services.createWebhook.mockRejectedValue(new Error('URL invalide : https requis'))
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Nouvel endpoint/i }))
    fireEvent.change(screen.getByLabelText(/^Nom/), { target: { value: 'Clair' } })
    fireEvent.change(screen.getByLabelText(/^URL/), {
      target: { value: 'http://kuro.example.test/hooks' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Créer$/ }))

    expect(await screen.findByText(/https requis/i)).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('envoie un test et rend compte du résultat', async () => {
    services.testWebhook.mockResolvedValue({
      delivery: { _id: 'd1' },
      outcome: { ok: true, httpStatus: 200, error: '', durationMs: 42, status: 'DELIVERED' },
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Tester/i }))

    await waitFor(() => expect(services.testWebhook).toHaveBeenCalledWith('e1'))
    expect(await screen.findByText(/HTTP 200/)).toBeInTheDocument()
  })

  it('bascule l’endpoint actif/inactif', async () => {
    services.updateWebhook.mockResolvedValue({ endpoint: { ...endpoint, isActive: false } })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Désactiver/i }))

    await waitFor(() => expect(services.updateWebhook).toHaveBeenCalledWith('e1', { isActive: false }))
  })

  it('signale un endpoint auto-désactivé', async () => {
    services.listWebhooks.mockResolvedValue({
      endpoints: [
        {
          ...endpoint,
          isActive: false,
          disabledReason: 'AUTO_FAILURES',
          disabledAt: '2026-08-26T11:00:00.000Z',
          consecutiveFailures: 20,
        },
      ],
      eventTypes: [],
    })
    renderPage()

    expect(await screen.findByText(/Désactivé automatiquement/i)).toBeInTheDocument()
    // Le paragraphe d'introduction mentionne aussi le seuil : on cible la ligne.
    expect(within(screen.getByRole('table')).getByText(/20 échecs consécutifs/i)).toBeInTheDocument()
  })
})
