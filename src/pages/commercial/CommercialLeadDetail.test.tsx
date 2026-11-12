import { EventEmitter } from 'events'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analysisFixture, transcriptFixture } from '../../components/calls/callInsights.fixtures'
import { apiFetch } from '../../lib/api'
import CommercialLeadDetail from './CommercialLeadDetail'
import { softphone } from './softphone/engine'

const sdk = vi.hoisted(() => ({ call: null as unknown }))

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('@twilio/voice-sdk', async () => {
  const { EventEmitter: Emitter } = await import('events')
  class Device extends Emitter {
    static isSupported = true
    audio = { setInputDevice: async () => undefined }
    updateToken() {}
    destroy() {}
    connect() {
      return Promise.resolve(sdk.call)
    }
  }
  return { Device }
})

const lead = {
  _id: 'lead1',
  company: 'Atelier Alpha',
  contactName: 'Alice',
  contactEmail: '',
  contactPhone: '',
  source: '',
  status: 'DEMO',
  priority: 'NORMALE',
  budget: null,
  nextActionAt: null,
  lastContactAt: null,
  notes: '',
  serviceType: '',
  leadTemperature: 'TIEDE',
  lostReason: '',
  lostComment: '',
  handedOffAt: null as string | null,
  callHold: null as { at: string; reason: string } | null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
}

function renderDetail() {
  render(
    <MemoryRouter initialEntries={['/commercial/leads/lead1']}>
      <Routes>
        <Route path="/commercial/leads/:id" element={<CommercialLeadDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CommercialLeadDetail', () => {
  beforeEach(() => {
    lead.handedOffAt = null
    lead.callHold = null
    vi.mocked(apiFetch).mockReset()
    vi.mocked(apiFetch).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path.endsWith('/ready-to-close') && options?.method === 'POST') {
        lead.handedOffAt = '2026-10-31T10:00:00.000Z'
        return { lead }
      }
      if (path === '/api/commercial/leads/lead1') return { lead: { ...lead }, activities: [], interactions: [] }
      throw new Error(`Unexpected path: ${path}`)
    })
  })

  it('transmet le dossier au closer après confirmation, puis passe la fiche en lecture seule', async () => {
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Prêt à closer' }))
    fireEvent.change(screen.getByPlaceholderText(/Contexte pour le closer/), { target: { value: 'Budget validé' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la transmission' }))

    expect(await screen.findByText(/Dossier transmis pour closing le/)).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith('/api/commercial/leads/lead1/ready-to-close', {
      method: 'POST',
      body: JSON.stringify({ message: 'Budget validé' }),
    })
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Prêt à closer' })).not.toBeInTheDocument()
  })

  it('propose l’appel avec la même barre, et garde tel: quand la téléphonie est désactivée', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/api/commercial/calls/config') return { enabled: false }
      if (path === '/api/commercial/leads/lead1')
        return { lead: { ...lead, contactPhone: '+33612345678' }, activities: [], interactions: [] }
      throw new Error(`Unexpected path: ${path}`)
    })
    renderDetail()
    expect(await screen.findByRole('group', { name: 'Appel téléphonique' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Appeler/ })).toHaveAttribute('href', 'tel:+33612345678')
  })

  it('dit simplement que la fiche n’est plus accessible quand elle a été réattribuée', async () => {
    vi.mocked(apiFetch).mockRejectedValue(Object.assign(new Error('Lead not found'), { status: 404 }))
    renderDetail()
    expect(await screen.findByText(/ne vous est plus attribué/)).toBeInTheDocument()
  })

  describe('appels de la fiche', () => {
    const requests: { path: string; method: string; body: Record<string, unknown> | null }[] = []
    const answeredCall = {
      _id: 'call1',
      status: 'COMPLETED',
      startedAt: '2026-11-12T10:00:00.000Z',
      answeredAt: '2026-11-12T10:00:08.000Z',
      endedAt: '2026-11-12T10:02:20.000Z',
      durationSec: 132,
      recording: { status: 'DELETED', objection: false },
      transcriptStatus: 'DONE',
      analysisStatus: 'READY',
    }
    let listed: unknown[]

    beforeEach(() => {
      requests.length = 0
      listed = [answeredCall]
      vi.stubGlobal('RTCPeerConnection', class {})
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: () => undefined }] })),
          enumerateDevices: vi.fn(async () => []),
        },
      })
      vi.mocked(apiFetch).mockImplementation(async (path: string, options?: RequestInit) => {
        const method = options?.method ?? 'GET'
        requests.push({ path, method, body: options?.body ? JSON.parse(String(options.body)) : null })
        if (path === '/api/commercial/leads/lead1')
          return { lead: { ...lead, contactPhone: '+33612345678' }, activities: [], interactions: [] }
        if (path === '/api/commercial/leads/lead1/calls')
          return method === 'POST' ? { callId: 'call2' } : { calls: listed }
        if (path === '/api/commercial/calls/config')
          return { enabled: true, callerId: '+33100000000', recording: { enabled: true, notice: true } }
        if (path === '/api/commercial/calls/token')
          return { token: 'jwt', identity: 'rep1', expiresAt: new Date(Date.now() + 600_000).toISOString() }
        if (path === '/api/commercial/calls/call2')
          return { ...answeredCall, _id: 'call2', lead: 'lead1', suggestedOutcome: null }
        if (path === '/api/commercial/calls/call2/hangup') return { status: 'COMPLETED' }
        if (path === '/api/commercial/calls/call1/transcript') return transcriptFixture
        if (path === '/api/commercial/calls/call1/analysis') return analysisFixture
        if (path === '/api/commercial/calls/call1/analysis/apply')
          return { lead, analysis: { ...analysisFixture.analysis, status: 'APPLIED' } }
        if (path === '/api/commercial/leads/lead1/interactions' && method === 'POST')
          return { interaction: { _id: 'i1' } }
        throw new Error(`Unexpected path: ${path}`)
      })
    })
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('liste les appels, ouvre l’analyse, et recharge la fiche une fois l’analyse appliquée', async () => {
      renderDetail()
      const row = await screen.findByRole('button', { name: /2:12/ })
      expect(row).toHaveTextContent('Analyse : à valider')
      fireEvent.click(row)
      await screen.findByText('Résumé de l’appel')

      const before = requests.filter((item) => item.path === '/api/commercial/leads/lead1').length
      fireEvent.click(
        within(screen.getByRole('group', { name: 'Décision pour : Budget' })).getByRole('button', { name: 'Accepter' }),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Appliquer la sélection' }))
      await waitFor(() =>
        expect(requests.filter((item) => item.path === '/api/commercial/leads/lead1').length).toBeGreaterThan(before),
      )
    })

    it('montre la retenue de la fiche, empêche de la rappeler et dit que lever la retenue revient à l’équipe', async () => {
      lead.callHold = { at: '2026-11-12T10:03:00.000Z', reason: 'OPT_OUT_DETECTED' }
      renderDetail()
      expect(await screen.findByText(/Fiche retenue\./)).toBeInTheDocument()
      expect(screen.getByText(/lever la retenue revient à l’équipe/)).toBeInTheDocument()
      expect(await screen.findByRole('button', { name: 'Appeler depuis le navigateur' })).toBeDisabled()
    })

    it('relie l’échange consigné après un appel passé depuis la fiche', async () => {
      const call = new EventEmitter() as EventEmitter & { disconnect: () => void }
      call.disconnect = () => call.emit('disconnect')
      sdk.call = call

      renderDetail()
      fireEvent.click(await screen.findByRole('button', { name: 'Appeler depuis le navigateur' }))
      await screen.findByText('Connexion…')
      call.emit('accept')
      await screen.findByRole('timer')
      fireEvent.click(screen.getByRole('button', { name: 'Raccrocher' }))

      expect(await screen.findByText(/sera relié à l’appel qui vient de se terminer \(2:12\)/)).toBeInTheDocument()
      fireEvent.change(screen.getByPlaceholderText(/Ce qui s’est dit/), {
        target: { value: 'Rendez-vous mardi' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter l’échange' }))
      await waitFor(() => expect(requests.some((item) => item.path.endsWith('/interactions'))).toBe(true))
      expect(requests.find((item) => item.path.endsWith('/interactions'))?.body).toMatchObject({
        kind: 'CALL',
        callId: 'call2',
        occurredAt: '2026-11-12T10:00:08.000Z',
        body: 'Rendez-vous mardi',
      })
      await waitFor(() => expect(softphone.getSnapshot().phase).toBe('idle'))
    })
  })
})
