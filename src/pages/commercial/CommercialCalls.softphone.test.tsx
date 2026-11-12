import { EventEmitter } from 'events'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../../lib/api'
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

const lead = {
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
    if (path === '/api/commercial/leads/lead1/calls') return { callId: 'call1' }
    if (path === '/api/commercial/calls/call1/hangup') return { status: 'COMPLETED' }
    if (path === '/api/commercial/calls/call1')
      return { _id: 'call1', lead: 'lead1', status: 'NO_ANSWER', durationSec: 0, suggestedOutcome: 'NRP' }
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
})
