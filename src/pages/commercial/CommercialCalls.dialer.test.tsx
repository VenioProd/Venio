import { EventEmitter } from 'events'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../../lib/api'
import CommercialCalls from './CommercialCalls'
import { softphone } from './softphone/engine'

const sdk = vi.hoisted(() => ({ calls: [] as unknown[] }))

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'rep1', name: 'Rep' } }) }))
vi.mock('@twilio/voice-sdk', async () => {
  const { EventEmitter: Emitter } = await import('events')
  class Device extends Emitter {
    static isSupported = true
    audio = { setInputDevice: async () => undefined }
    updateToken() {}
    destroy() {}
    async connect() {
      const call = new Emitter() as InstanceType<typeof Emitter> & { disconnect: () => void }
      call.disconnect = () => call.emit('disconnect')
      sdk.calls.push(call)
      return call
    }
  }
  return { Device }
})

const leadOf = (id: string, company: string) => ({
  _id: id,
  company,
  contactName: '',
  contactEmail: '',
  contactPhone: '+3361234567' + id.slice(-1),
  source: '',
  extraInfo: {},
  lastCallOutcome: null,
  nextActionAt: null,
})
const settings = {
  projects: [],
  scriptTags: [],
  defaultRegion: 'FR',
  outcomes: [
    { value: 'NRP', fr: 'Pas de réponse', en: 'No answer', effect: 'NONE', reached: false, retryAfterMinutes: 240 },
    { value: 'MSG', fr: 'Messagerie', en: 'Voicemail', effect: 'VOICEMAIL', reached: false, retryAfterMinutes: 1440 },
    { value: 'RDV', fr: 'Rendez-vous', en: 'Meeting', effect: 'MEETING', reached: true, retryAfterMinutes: null },
  ],
}

let dialer: { voicemailDetection: boolean; previewDelaySec: number; powerDelaySec: number }
/** Ce que le serveur dit de chaque appel une fois raccroché. */
let records: Record<string, Record<string, unknown>>
/** Refus du serveur au lancement, par fiche. */
let refusals: Record<string, string>
const requests: { path: string; method: string; body: Record<string, unknown> | undefined }[] = []
const launches = () => requests.filter((item) => item.method === 'POST' && /\/leads\/\w+\/calls$/.test(item.path))
const outcomes = () => requests.filter((item) => item.path.endsWith('/quick-call'))

function installApi() {
  vi.mocked(apiFetch).mockImplementation(async (path: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    const body = options?.body ? JSON.parse(String(options.body)) : undefined
    requests.push({ path, method, body })
    if (path === '/api/commercial/calls/settings') return settings
    if (path === '/api/commercial/calls/filters') return { lists: [], projects: [] }
    if (path.startsWith('/api/commercial/calls/queue'))
      return {
        leads: [leadOf('lead1', 'Atelier Alpha'), leadOf('lead2', 'Boulangerie Beta'), leadOf('lead3', 'Cave Gamma')],
        nextCursor: null,
      }
    if (path === '/api/commercial/calls/config')
      return { enabled: true, callerId: '+33100000000', callingHours: null, attemptCap: 3, dialer }
    if (path === '/api/commercial/calls/token')
      return { token: 'jwt', identity: 'rep1', expiresAt: new Date(Date.now() + 600_000).toISOString() }
    const launch = /^\/api\/commercial\/leads\/(\w+)\/calls$/.exec(path)
    if (launch && method === 'POST') {
      const code = refusals[launch[1]!]
      if (code) throw Object.assign(new Error(code), { status: 409, payload: { error: code, code } })
      return { callId: `call-${launch[1]}` }
    }
    if (/\/calls\/call-\w+\/hangup$/.test(path)) return { status: 'COMPLETED' }
    const read = /^\/api\/commercial\/calls\/(call-\w+)$/.exec(path)
    if (read) return records[read[1]!] ?? { _id: read[1], status: 'NO_ANSWER', suggestedOutcome: 'NRP' }
    if (path.endsWith('/quick-call')) return { interactionId: `i-${requests.length}` }
    if (/\/api\/commercial\/leads\/\w+$/.test(path)) return { lead: {}, activities: [], interactions: [] }
    throw new Error(`Unexpected path: ${path}`)
  })
}

const renderCalls = () =>
  render(
    <MemoryRouter>
      <CommercialCalls />
    </MemoryRouter>,
  )
const lastCall = () => sdk.calls[sdk.calls.length - 1] as EventEmitter & { disconnect: () => void }

describe('CommercialCalls — composition enchaînée', () => {
  beforeEach(() => {
    requests.length = 0
    sdk.calls.length = 0
    localStorage.clear()
    dialer = { voicemailDetection: true, previewDelaySec: 0, powerDelaySec: 0 }
    records = {}
    refusals = {}
    vi.stubGlobal('RTCPeerConnection', class {})
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: () => undefined }] })),
        enumerateDevices: vi.fn(async () => []),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    })
    installApi()
  })
  afterEach(async () => {
    cleanup()
    await waitFor(() => expect(softphone.getSnapshot().phase).toBe('idle'))
    softphone.dismiss()
    softphone.retry()
    vi.unstubAllGlobals()
  })

  it('power dialer : un appel à la fois, sans réponse noté d’office, le suivant part seul ; la pause arrête net', async () => {
    renderCalls()
    fireEvent.click(await screen.findByRole('button', { name: 'Power dialer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Démarrer' }))

    await waitFor(() => expect(sdk.calls).toHaveLength(1))
    expect(launches().map((item) => item.path)).toEqual(['/api/commercial/leads/lead1/calls'])
    expect(await screen.findByText('En appel : Atelier Alpha.')).toBeInTheDocument()

    // Pas de réponse : le résultat suggéré est enregistré avec l'appel, puis la fiche suivante est appelée.
    lastCall().emit('disconnect')
    await waitFor(() => expect(outcomes()).toHaveLength(1))
    expect(outcomes()[0]!.body).toMatchObject({ callId: 'call-lead1', outcome: 'NRP' })
    await waitFor(() => expect(sdk.calls).toHaveLength(2))
    expect(launches()[launches().length - 1]!.path).toBe('/api/commercial/leads/lead2/calls')

    // Décroché par un humain : rien ne part avant la saisie du résultat.
    records['call-lead2'] = {
      _id: 'call-lead2',
      status: 'COMPLETED',
      answeredAt: 'x',
      durationSec: 40,
      suggestedOutcome: null,
    }
    lastCall().emit('accept')
    lastCall().emit('disconnect')
    expect(
      await screen.findByText('Saisissez le résultat de Boulangerie Beta pour passer à la suivante.'),
    ).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(sdk.calls).toHaveLength(2)
    expect(outcomes()).toHaveLength(1)

    // La pause arrête l'enchaînement : le résultat saisi n'entraîne plus d'appel.
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    fireEvent.click(screen.getByRole('button', { name: /^Rendez-vous/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et suivant' }))
    await waitFor(() => expect(outcomes()).toHaveLength(2))
    expect(await screen.findByText(/En pause/)).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(sdk.calls).toHaveLength(2)
  })

  it('power dialer : un numéro des États-Unis refusé par le serveur est passé, la suivante est appelée', async () => {
    refusals = { lead1: 'POWER_DIALER_BLOCKED' }
    renderCalls()
    fireEvent.click(await screen.findByRole('button', { name: 'Power dialer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Démarrer' }))
    await waitFor(() => expect(sdk.calls).toHaveLength(1))
    expect(launches().map((item) => [item.path, item.body?.mode])).toEqual([
      ['/api/commercial/leads/lead1/calls', 'power'],
      ['/api/commercial/leads/lead2/calls', 'power'],
    ])
    expect(outcomes()).toHaveLength(0)
  })

  it('messagerie détectée au clic : raccroché par le serveur, résultat « messagerie » noté d’office', async () => {
    records['call-lead1'] = { _id: 'call-lead1', status: 'COMPLETED', answeredBy: 'MACHINE', suggestedOutcome: 'MSG' }
    renderCalls()
    fireEvent.click(await screen.findByRole('button', { name: /Atelier Alpha/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Appeler depuis le navigateur' }))
    await waitFor(() => expect(sdk.calls).toHaveLength(1))
    lastCall().emit('accept')
    lastCall().emit('disconnect')
    await waitFor(() => expect(outcomes()).toHaveLength(1))
    expect(outcomes()[0]!.body).toMatchObject({ callId: 'call-lead1', outcome: 'MSG' })
    expect(launches()[0]!.body).not.toHaveProperty('mode')
    // Au clic, rien ne part ensuite tout seul.
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(sdk.calls).toHaveLength(1)
  })

  it('aperçu : compte à rebours sur la fiche ; plafond atteint, fiche passée ; opposition, arrêt net', async () => {
    dialer = { voicemailDetection: true, previewDelaySec: 1, powerDelaySec: 0 }
    refusals = { lead1: 'ATTEMPT_CAP_REACHED', lead2: 'PHONE_SUPPRESSED' }
    renderCalls()
    fireEvent.click(await screen.findByRole('button', { name: 'Aperçu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Démarrer' }))
    expect(await screen.findByText('Appel de Atelier Alpha dans 1 s.')).toBeInTheDocument()

    // Plafond du numéro atteint : la fiche est écartée, la suivante est proposée.
    await waitFor(() => expect(launches()).toHaveLength(1), { timeout: 2500 })
    expect(await screen.findByText(/Appel de Boulangerie Beta dans/)).toBeInTheDocument()
    // Numéro opposé : arrêt net, la troisième fiche n'est jamais appelée.
    await waitFor(() => expect(launches()).toHaveLength(2), { timeout: 2500 })
    expect(await screen.findByText(/Arrêté : opposition du prospect/)).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 1300))
    expect(launches()).toHaveLength(2)
    expect(sdk.calls).toHaveLength(0)
  })
})
