import { EventEmitter } from 'events'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../../lib/api'
import { analysisFixture, transcriptFixture } from '../../components/calls/callInsights.fixtures'
import CommercialCalls from './CommercialCalls'
import { softphone } from './softphone/engine'

const sdk = vi.hoisted(() => ({ call: null as unknown, connect: null as unknown }))

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'rep1', name: 'Rep' } }) }))
vi.mock('@twilio/voice-sdk', async () => {
  const { EventEmitter: Emitter } = await import('events')
  class Device extends Emitter {
    static isSupported = true
    audio = { setInputDevice: async () => undefined }
    updateToken() {}
    destroy() {}
    connect(options: unknown) {
      return (sdk.connect as (options: unknown) => Promise<unknown>)(options)
    }
  }
  return { Device }
})

const baseLead = {
  _id: 'lead1',
  company: 'Atelier Alpha',
  contactName: 'Alice',
  contactEmail: '',
  contactPhone: '+33612345678',
  source: '',
  extraInfo: {},
  lastCallOutcome: null,
  nextActionAt: null,
}
let lead: Record<string, unknown> = baseLead
const settings = {
  projects: [],
  scriptTags: [],
  defaultRegion: 'FR',
  outcomes: [
    { value: 'NRP', fr: 'Pas de réponse', en: 'No answer', effect: 'NONE', reached: false, retryAfterMinutes: null },
    { value: 'RDV', fr: 'Rendez-vous', en: 'Meeting', effect: 'MEETING', reached: true, retryAfterMinutes: null },
  ],
}

let callsConfig: unknown
let callRecord: Record<string, unknown>
let leadCalls: unknown[]
const requests: { path: string; method: string; body: unknown }[] = []

function installApi() {
  vi.mocked(apiFetch).mockImplementation(async (path: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    const body = options?.body ? JSON.parse(String(options.body)) : undefined
    requests.push({ path, method, body })
    if (path === '/api/commercial/calls/settings') return settings
    if (path === '/api/commercial/calls/filters') return { lists: [], projects: [] }
    if (path.startsWith('/api/commercial/calls/queue')) return { leads: [lead], nextCursor: null }
    if (path === '/api/commercial/leads/lead1') return { lead, activities: [], interactions: [] }
    if (path === '/api/commercial/calls/config') {
      if (callsConfig instanceof Error) throw callsConfig
      return callsConfig
    }
    if (path === '/api/commercial/calls/token')
      return { token: 'jwt', identity: 'rep1', expiresAt: new Date(Date.now() + 600_000).toISOString() }
    if (path === '/api/commercial/leads/lead1/calls')
      return method === 'POST' ? { callId: 'call1' } : { calls: leadCalls }
    if (path === '/api/commercial/calls/call1/hangup') return { status: 'COMPLETED' }
    if (path === '/api/commercial/calls/call1/recording/stop')
      return { recording: { status: 'STOPPED', objection: true } }
    if (path === '/api/commercial/calls/call1/transcript') return transcriptFixture
    if (path === '/api/commercial/calls/call1/analysis') return analysisFixture
    if (path === '/api/commercial/calls/call1') return callRecord
    if (path === '/api/commercial/leads/lead1/quick-call') return { interactionId: 'interaction1' }
    throw new Error(`Unexpected path: ${path}`)
  })
}

const renderCalls = () =>
  render(
    <MemoryRouter>
      <CommercialCalls />
    </MemoryRouter>,
  )

async function openLead() {
  fireEvent.click(await screen.findByRole('button', { name: /Atelier Alpha/ }))
  await screen.findByRole('group', { name: 'Appel téléphonique' })
}

describe('CommercialCalls — softphone', () => {
  beforeEach(() => {
    requests.length = 0
    localStorage.clear()
    callsConfig = { enabled: true, callerId: '+33100000000', callingHours: null, attemptCap: 3 }
    callRecord = { _id: 'call1', lead: 'lead1', status: 'NO_ANSWER', durationSec: 0, suggestedOutcome: 'NRP' }
    leadCalls = []
    lead = { ...baseLead }
    vi.stubGlobal('RTCPeerConnection', class {})
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: () => undefined }] })),
        enumerateDevices: vi.fn(async () => []),
      },
    })
    const call = new EventEmitter() as EventEmitter & { disconnect: () => void }
    call.disconnect = () => call.emit('disconnect')
    sdk.call = call
    sdk.connect = vi.fn(async () => call)
    installApi()
  })
  afterEach(async () => {
    cleanup() // démonter l'écran raccroche un éventuel appel en cours
    await waitFor(() => expect(softphone.getSnapshot().phase).toBe('idle'))
    softphone.dismiss()
    softphone.retry()
    vi.unstubAllGlobals()
  })

  it('appelle depuis la barre, présélectionne le résultat suggéré et envoie le callId avec la fiche', async () => {
    renderCalls()
    await openLead()
    fireEvent.click(await screen.findByRole('button', { name: 'Appeler depuis le navigateur' }))

    await waitFor(() => expect(sdk.connect).toHaveBeenCalledWith({ params: { callId: 'call1' } }))
    const call = sdk.call as EventEmitter
    call.emit('ringing', false)
    expect(await screen.findByText('Ça sonne…')).toBeInTheDocument()
    call.emit('accept')
    expect(await screen.findByRole('timer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer et suivant' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Atelier Alpha/ })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Raccrocher' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Pas de réponse/ })).toHaveAttribute('aria-pressed', 'true'),
    )
    expect(screen.getByText(/Résultat présélectionné d’après l’appel : Pas de réponse/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/durée/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et suivant' }))
    await waitFor(() => expect(requests.some((item) => item.path.endsWith('/quick-call'))).toBe(true))
    const quickCall = requests.find((item) => item.path.endsWith('/quick-call'))
    expect(quickCall?.body).toMatchObject({ callId: 'call1', outcome: 'NRP' })
    expect(quickCall?.body).not.toHaveProperty('durationSec')
  })

  it('ne remplace pas un résultat choisi à la main avant la fin de l’appel', async () => {
    renderCalls()
    await openLead()
    fireEvent.click(await screen.findByRole('button', { name: 'Appeler depuis le navigateur' }))
    await waitFor(() => expect(sdk.connect).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /^Rendez-vous/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Raccrocher' }))
    await screen.findByText(/Pas de réponse|Appel terminé/)
    expect(screen.getByRole('button', { name: /^Rendez-vous/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('garde le lien tel: et le dit quand la téléphonie est désactivée', async () => {
    callsConfig = { enabled: false, callerId: null, callingHours: null, attemptCap: null }
    renderCalls()
    await openLead()
    const link = await screen.findByRole('link', { name: /Appeler/ })
    expect(link).toHaveAttribute('href', 'tel:+33612345678')
    expect(screen.getByText(/appels depuis le navigateur ne sont pas activés/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Appeler depuis le navigateur' })).not.toBeInTheDocument()
  })

  it('garde le lien tel: quand le service d’appel est injoignable', async () => {
    callsConfig = Object.assign(new Error('Not found'), { status: 404 })
    renderCalls()
    await openLead()
    expect(await screen.findByRole('link', { name: /Appeler/ })).toHaveAttribute('href', 'tel:+33612345678')
    expect(screen.getByText(/service d’appel est injoignable/)).toBeInTheDocument()
  })

  it('bascule sur tel: quand le micro est refusé, sans créer d’appel côté serveur', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
    )
    renderCalls()
    await openLead()
    fireEvent.click(await screen.findByRole('button', { name: 'Appeler depuis le navigateur' }))
    expect(await screen.findByRole('link', { name: /Appeler/ })).toHaveAttribute('href', 'tel:+33612345678')
    expect(screen.getByText(/Micro inaccessible/)).toBeInTheDocument()
    expect(requests.some((item) => item.path.endsWith('/lead1/calls'))).toBe(false)
  })

  it('demande confirmation avant de quitter la page pendant un appel', async () => {
    renderCalls()
    await openLead()
    fireEvent.click(await screen.findByRole('button', { name: 'Appeler depuis le navigateur' }))
    await waitFor(() => expect(sdk.connect).toHaveBeenCalled())

    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    ;(sdk.call as EventEmitter).emit('disconnect')
    await screen.findByText(/Pas de réponse|Appel terminé/)
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })

  describe('enregistrement, transcript et analyse', () => {
    const answered = {
      _id: 'call1',
      lead: 'lead1',
      status: 'COMPLETED',
      startedAt: new Date().toISOString(),
      answeredAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationSec: 134,
      suggestedOutcome: null,
    }
    const listed = (change: Record<string, unknown> = {}) => ({
      ...answered,
      recording: { status: 'DELETED', objection: false },
      transcriptStatus: 'DONE',
      analysisStatus: 'READY',
      ...change,
    })

    async function dial() {
      renderCalls()
      await openLead()
      fireEvent.click(await screen.findByRole('button', { name: 'Appeler depuis le navigateur' }))
      await waitFor(() => expect(sdk.connect).toHaveBeenCalled())
      ;(sdk.call as EventEmitter).emit('accept')
      await screen.findByRole('timer')
    }

    it('signale l’enregistrement en cours et confirme son arrêt quand le prospect le refuse', async () => {
      callsConfig = { ...(callsConfig as object), edge: 'dublin', recording: { enabled: true, notice: true } }
      await dial()
      expect(screen.getByText(/Enregistrement en cours/)).toBeInTheDocument()
      expect(screen.getByText(/prévenu par un message automatique/)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Le prospect refuse l’enregistrement' }))
      expect(await screen.findByText(/Enregistrement arrêté : ce qui avait été capté est effacé/)).toBeInTheDocument()
      expect(requests.find((item) => item.path === '/api/commercial/calls/call1/recording/stop')?.method).toBe('POST')
      expect(screen.queryByRole('button', { name: 'Le prospect refuse l’enregistrement' })).not.toBeInTheDocument()
      expect(screen.queryByText(/Enregistrement en cours/)).not.toBeInTheDocument()
    })

    it('n’affiche ni indicateur ni bouton quand l’enregistrement est désactivé', async () => {
      callsConfig = { ...(callsConfig as object), recording: { enabled: false, notice: false } }
      await dial()
      expect(screen.queryByText(/Enregistrement en cours/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Le prospect refuse l’enregistrement' })).not.toBeInTheDocument()
    })

    it('donne accès au transcript et à l’analyse dès qu’ils sont prêts, sans toucher aux raccourcis de la file', async () => {
      callRecord = answered
      leadCalls = [listed({ transcriptStatus: 'PROCESSING', analysisStatus: null })]
      await dial()
      fireEvent.click(screen.getByRole('button', { name: 'Raccrocher' }))

      const section = await screen.findByRole('region', { name: 'Appels de la séance' })
      const open = within(section).getByRole('button', { name: 'Transcript et analyse' })
      await waitFor(() => expect(open).toBeDisabled())
      expect(section).toHaveTextContent('Atelier Alpha')
      expect(section).toHaveTextContent('Transcript : en cours')

      // Le transcript devient prêt : l'accès s'ouvre sans que la file ait bougé.
      leadCalls = [listed()]
      await waitFor(() => expect(open).toBeEnabled(), { timeout: 12000 })
      fireEvent.click(open)
      expect(await within(section).findByText('Résumé de l’appel')).toBeInTheDocument()

      // Alt+1 depuis la zone d'analyse ne change pas le résultat de la fiche ouverte.
      const accept = within(section).getAllByRole('button', { name: 'Accepter' })[0]
      const before = screen.getByRole('button', { name: /^Pas de réponse/ }).getAttribute('aria-pressed')
      fireEvent.keyDown(accept, { altKey: true, code: 'Digit2', key: '2' })
      expect(screen.getByRole('button', { name: /^Rendez-vous/ })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: /^Pas de réponse/ })).toHaveAttribute('aria-pressed', before)
      // Les raccourcis de la saisie restent actifs hors de la zone.
      fireEvent.keyDown(screen.getByRole('textbox', { name: /Notes/ }), { altKey: true, code: 'Digit2', key: '2' })
      expect(screen.getByRole('button', { name: /^Rendez-vous/ })).toHaveAttribute('aria-pressed', 'true')
    }, 20000)

    it('montre la retenue d’une fiche dans la file et empêche de la rappeler', async () => {
      lead = { ...baseLead, callHold: { at: new Date().toISOString(), reason: 'OPT_OUT_DETECTED' } }
      renderCalls()
      const row = await screen.findByRole('button', { name: /Atelier Alpha/ })
      expect(row).toHaveTextContent('Retenue')
      fireEvent.click(row)
      await screen.findByRole('group', { name: 'Appel téléphonique' })
      expect(screen.getByText(/lever la retenue revient à l’équipe/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Appeler depuis le navigateur' })).toBeDisabled()
    })
  })
})
