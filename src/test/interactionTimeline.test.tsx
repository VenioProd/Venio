import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TimelineEntry, TimelineResponse } from '../types/interaction.types'

const services = vi.hoisted(() => ({
  fetchTimeline: vi.fn(),
  logInteraction: vi.fn(),
  updateInteraction: vi.fn(),
  deleteInteraction: vi.fn(),
  sendInteractionEmail: vi.fn(),
}))

vi.mock('../services/interactions', () => services)

import InteractionTimeline from '../components/admin/InteractionTimeline'

function entry(overrides: Partial<TimelineEntry> & { id: string }): TimelineEntry {
  return {
    source: 'INTERACTION',
    kind: 'CALL',
    direction: 'OUT',
    occurredAt: '2026-08-20T09:00:00.000Z',
    label: 'Appel',
    body: '',
    pinned: false,
    author: { _id: 'u1', name: 'Raphael', email: 'r@venio.paris' },
    recipients: [],
    deliveryStatus: 'NONE',
    ...overrides,
  }
}

function timeline(entries: TimelineEntry[]): TimelineResponse {
  return {
    entries,
    hasMore: false,
    limit: 200,
    subject: {
      type: 'LEAD',
      id: 'lead-1',
      label: 'Acme',
      contactEmail: 'contact@acme.fr',
      contactName: 'Camille',
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  services.fetchTimeline.mockResolvedValue(timeline([]))
  services.logInteraction.mockResolvedValue({ interaction: { _id: 'i1' } })
  services.updateInteraction.mockResolvedValue({})
  services.deleteInteraction.mockResolvedValue({})
})

function renderTimeline(canWrite = true, legacyNote?: string) {
  return render(
    <InteractionTimeline subjectType="LEAD" subjectId="lead-1" canWrite={canWrite} legacyNote={legacyNote} />,
  )
}

describe('InteractionTimeline — rendu', () => {
  it('distingue les échanges des événements système', async () => {
    services.fetchTimeline.mockResolvedValue(
      timeline([
        entry({ id: 'a', label: 'Appel de qualification', body: 'Budget confirmé' }),
        entry({ id: 'b', source: 'SYSTEM', kind: 'STATUS_CHANGE', label: 'Statut passé à DEMO' }),
      ]),
    )
    renderTimeline()

    await screen.findByText('Appel de qualification')
    expect(screen.getByText('Statut passé à DEMO')).toBeInTheDocument()
    expect(screen.getByText('1 échange · 1 événement')).toBeInTheDocument()
  })

  it('filtre par type', async () => {
    services.fetchTimeline.mockResolvedValue(
      timeline([
        entry({ id: 'a', kind: 'CALL', label: 'Un appel' }),
        entry({ id: 'b', kind: 'NOTE', label: 'Une note' }),
      ]),
    )
    renderTimeline()
    await screen.findByText('Un appel')

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
    expect(screen.queryByText('Un appel')).not.toBeInTheDocument()
    expect(screen.getByText('Une note')).toBeInTheDocument()
  })

  it("affiche le détail d'un envoi partiellement échoué", async () => {
    services.fetchTimeline.mockResolvedValue(
      timeline([
        entry({
          id: 'a',
          kind: 'EMAIL',
          label: 'Notre proposition',
          deliveryStatus: 'PARTIAL',
          recipients: [
            { email: 'ok@acme.fr', name: '', status: 'SENT', error: '' },
            { email: 'ko@acme.fr', name: '', status: 'FAILED', error: 'unknown mailbox' },
          ],
        }),
      ]),
    )
    renderTimeline()

    await screen.findByText('Notre proposition')
    expect(screen.getByText('Partiellement envoyé')).toBeInTheDocument()
    expect(screen.getByText(/ko@acme\.fr — unknown mailbox/)).toBeInTheDocument()
  })

  it('montre la note historique reprise du champ libre', async () => {
    renderTimeline(true, 'Ancien texte saisi à la main')
    await screen.findByText('Note historique')
    expect(screen.getByText('Ancien texte saisi à la main')).toBeInTheDocument()
  })

  it('masque composeurs et actions en lecture seule', async () => {
    services.fetchTimeline.mockResolvedValue(timeline([entry({ id: 'a' })]))
    renderTimeline(false)

    await screen.findByText('Appel')
    expect(screen.queryByRole('button', { name: 'Consigner' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Écrire un email' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument()
  })
})

describe('InteractionTimeline — saisie', () => {
  it('consigne un appel et recharge', async () => {
    renderTimeline()
    await screen.findByRole('button', { name: 'Consigner' })

    fireEvent.change(screen.getByPlaceholderText("Ce qui s'est dit…"), {
      target: { value: 'Rappelé, il rappelle lundi' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Consigner' }))

    await waitFor(() => expect(services.logInteraction).toHaveBeenCalledTimes(1))
    const [subjectType, subjectId, input] = services.logInteraction.mock.calls[0]
    expect(subjectType).toBe('LEAD')
    expect(subjectId).toBe('lead-1')
    expect(input.kind).toBe('CALL')
    expect(input.body).toBe('Rappelé, il rappelle lundi')
    expect(services.fetchTimeline).toHaveBeenCalledTimes(2)
  })

  it('garde la saisie quand la consignation échoue', async () => {
    services.logInteraction.mockRejectedValue(new Error('Action impossible'))
    renderTimeline()
    await screen.findByRole('button', { name: 'Consigner' })

    fireEvent.change(screen.getByPlaceholderText("Ce qui s'est dit…"), { target: { value: 'À ne pas perdre' } })
    fireEvent.click(screen.getByRole('button', { name: 'Consigner' }))

    await screen.findByText('Action impossible')
    expect(screen.getByPlaceholderText("Ce qui s'est dit…")).toHaveValue('À ne pas perdre')
  })

  it("pré-remplit le destinataire de l'email avec le contact du sujet", async () => {
    renderTimeline()
    fireEvent.click(await screen.findByRole('button', { name: 'Écrire un email' }))
    expect(screen.getByDisplayValue('contact@acme.fr')).toBeInTheDocument()
  })

  it("rend compte d'un envoi partiel sans vider le message", async () => {
    services.sendInteractionEmail.mockResolvedValue({
      sent: 1,
      failed: 1,
      total: 2,
      results: [
        { email: 'ok@acme.fr', name: '', success: true },
        { email: 'ko@acme.fr', name: '', success: false, error: 'unknown mailbox' },
      ],
    })
    renderTimeline()
    fireEvent.click(await screen.findByRole('button', { name: 'Écrire un email' }))

    fireEvent.change(screen.getByPlaceholderText('Bonjour,'), { target: { value: 'Voici le devis.' } })
    const subjectField = screen.getAllByRole('textbox').find((field) => field.getAttribute('maxlength') === '500')!
    fireEvent.change(subjectField, { target: { value: 'Proposition' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    await screen.findByText(/1 envoi sur 2/)
    expect(screen.getByPlaceholderText('Bonjour,')).toHaveValue('Voici le devis.')
  })
})
