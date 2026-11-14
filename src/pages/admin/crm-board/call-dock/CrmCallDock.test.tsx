import { EventEmitter } from 'events'
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../../../../lib/api'
import type { Lead } from '../../../../types/crm.types'
import CommercialCalls from '../../../commercial/CommercialCalls'
import { softphone } from '../../../commercial/softphone/engine'
import LeadCallBar from '../LeadCallBar'
import TeamCallDesk from '../TeamCallDesk'
import { CallDockStore } from './callDockStore'
import CrmCallProvider from './CrmCallProvider'

const sdk = vi.hoisted(() => ({ call: null as unknown, connect: null as unknown, devices: 0 }))

vi.mock('../../../../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'admin1', name: 'Admin', role: 'SUPER_ADMIN' }, loading: false }),
}))
vi.mock('@twilio/voice-sdk', async () => {
  const { EventEmitter: Emitter } = await import('events')
  class Device extends Emitter {
    static isSupported = true
    audio = { setInputDevice: async () => undefined }
    constructor() {
      super()
      sdk.devices += 1
    }
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
const requests: { path: string; method: string; body: unknown }[] = []

function installApi() {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    requests.push({ path, method, body: options?.body ? JSON.parse(String(options.body)) : undefined })
    const route = path.replace(/^\/api\/(admin\/call-desk|commercial)/, '')
    if (route === '/calls/settings') return settings
    if (route === '/calls/filters') return { lists: [], projects: [] }
    if (route.startsWith('/calls/queue')) return { leads: [lead], nextCursor: null }
    if (route === '/leads/lead1/calls') return method === 'POST' ? { callId: 'call1' } : { calls: [] }
    if (route === '/calls/config') return { enabled: true, callerId: '+33100000000', callingHours: null, attemptCap: 3 }
    if (route === '/calls/token')
      return { token: 'jwt', identity: 'admin1', expiresAt: new Date(Date.now() + 600_000).toISOString() }
    if (route === '/calls/call1/hangup') return { status: 'COMPLETED' }
    if (route === '/calls/call1')
      return { _id: 'call1', lead: 'lead1', status: 'NO_ANSWER', durationSec: 0, suggestedOutcome: 'NRP' }
    if (route === '/leads/lead1/quick-call') return { interactionId: 'interaction1' }
    if (path.startsWith('/api/admin/interactions/')) return { entries: [] }
    throw new Error(`Unexpected path: ${path}`)
  }) as typeof apiFetch)
}

const POSTE = '/admin/crm/prospecter/poste'
const nav = (
  <nav>
    <Link to="/admin/crm/suivre/pipeline">Aller au pipeline</Link>
    <Link to="/admin/crm/leads/lead1">Aller à la fiche</Link>
    <Link to={POSTE}>Aller au poste</Link>
    <Link to="/admin/projets">Aller aux projets</Link>
  </nav>
)
// La fiche est montée sous un autre élément, comme `RequirePermission` dans App.tsx : la coque y remonte.
const Guard = ({ children }: { children: ReactNode }) => <>{children}</>

function renderCrm(store: CallDockStore) {
  const shell = (screen: ReactNode) => (
    <CrmCallProvider store={store}>
      {nav}
      {screen}
    </CrmCallProvider>
  )
  return render(
    <MemoryRouter initialEntries={[POSTE]}>
      <Routes>
        <Route path={POSTE} element={shell(<TeamCallDesk />)} />
        <Route path="/admin/crm/suivre/pipeline" element={shell(<p>Pipeline des leads</p>)} />
        <Route
          path="/admin/crm/leads/lead1"
          element={<Guard>{shell(<LeadCallBar lead={lead as unknown as Lead} />)}</Guard>}
        />
        <Route path="/admin/projets" element={<p>Projets</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const dock = () => screen.queryByRole('region', { name: 'Appel téléphonique en cours' })
const hangups = () => requests.filter((item) => item.path.endsWith('/calls/call1/hangup'))

async function callFromDesk() {
  fireEvent.click(await screen.findByRole('button', { name: /Atelier Alpha/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Appeler depuis le navigateur' }))
  await waitFor(() => expect(sdk.connect).toHaveBeenCalledWith({ params: { callId: 'call1' } }))
  ;(sdk.call as EventEmitter).emit('accept')
  await screen.findByRole('timer')
}

async function saveFromDesk() {
  fireEvent.click(await screen.findByRole('button', { name: /Atelier Alpha/ }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^Pas de réponse/ })).toHaveAttribute('aria-pressed', 'true'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et suivant' }))
  await waitFor(() => expect(requests.find((item) => item.path.endsWith('/quick-call'))).toBeDefined())
  return requests.find((item) => item.path.endsWith('/quick-call'))?.body
}

describe('Dock d’appel du CRM', () => {
  let confirm: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    requests.length = 0
    sdk.devices = 0
    localStorage.clear()
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
    confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    installApi()
  })
  afterEach(async () => {
    cleanup()
    await waitFor(() => expect(softphone.getSnapshot().phase).toBe('idle'))
    softphone.dismiss()
    softphone.retry()
    confirm.mockRestore()
    vi.unstubAllGlobals()
  })

  it('garde l’appel d’un écran à l’autre, le montre dans le dock hors de sa barre et raccroche depuis le dock', async () => {
    renderCrm(new CallDockStore(0))
    await callFromDesk()
    expect(dock()).toBeNull()

    fireEvent.click(screen.getByRole('link', { name: 'Aller au pipeline' }))
    await screen.findByText('Pipeline des leads')
    const bar = dock()!
    expect(bar).toHaveTextContent('Atelier Alpha')
    expect(within(bar).getByRole('timer')).toBeInTheDocument()
    expect(within(bar).getByRole('link', { name: /Revenir au poste d’appel/ })).toHaveAttribute('href', POSTE)

    // La fiche du lead appelé montre sa propre barre : pas de dock. La coque a remonté sans couper l'appel.
    fireEvent.click(screen.getByRole('link', { name: 'Aller à la fiche' }))
    expect(await screen.findByRole('button', { name: 'Raccrocher' })).toBeInTheDocument()
    expect(dock()).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(softphone.getSnapshot().phase).toBe('active')

    // Au poste, la ligne appelée est repliée : le dock reprend la main.
    fireEvent.click(screen.getByRole('link', { name: 'Aller au poste' }))
    await screen.findByRole('button', { name: /Atelier Alpha/ })
    expect(confirm).not.toHaveBeenCalled()
    expect(hangups()).toHaveLength(0)
    expect(sdk.devices).toBe(1)

    fireEvent.click(within(dock()!).getByRole('button', { name: 'Raccrocher' }))
    await waitFor(() => expect(softphone.getSnapshot().phase).toBe('idle'))
    expect(hangups()).toHaveLength(1)
    await waitFor(() => expect(dock()).toBeNull())
    expect(await saveFromDesk()).toMatchObject({ callId: 'call1', outcome: 'NRP' })
  })

  it('appel terminé hors de son écran : le résultat reste dû jusqu’au retour au poste', async () => {
    renderCrm(new CallDockStore(0))
    await callFromDesk()
    fireEvent.click(screen.getByRole('link', { name: 'Aller au pipeline' }))
    await screen.findByText('Pipeline des leads')
    ;(sdk.call as EventEmitter).emit('disconnect')

    await waitFor(() => expect(dock()).toHaveTextContent('Résultat à saisir pour Atelier Alpha'))
    fireEvent.click(screen.getByRole('link', { name: 'Aller à la fiche' }))
    await screen.findByRole('button', { name: 'Appeler depuis le navigateur' })
    expect(dock()).toHaveTextContent('Résultat à saisir pour Atelier Alpha')

    fireEvent.click(within(dock()!).getByRole('link', { name: 'Saisir le résultat' }))
    expect(await saveFromDesk()).toMatchObject({ callId: 'call1', outcome: 'NRP' })
    expect(dock()).toBeNull()
  })

  it('un résultat dû écarté ne revient pas au poste', async () => {
    renderCrm(new CallDockStore(0))
    await callFromDesk()
    fireEvent.click(screen.getByRole('link', { name: 'Aller au pipeline' }))
    await screen.findByText('Pipeline des leads')
    ;(sdk.call as EventEmitter).emit('disconnect')
    fireEvent.click(await screen.findByRole('button', { name: 'Écarter le résultat à saisir' }))
    expect(dock()).toBeNull()

    fireEvent.click(screen.getByRole('link', { name: 'Aller au poste' }))
    fireEvent.click(await screen.findByRole('button', { name: /Atelier Alpha/ }))
    expect(await screen.findByRole('button', { name: /^Pas de réponse/ })).toHaveAttribute('aria-pressed', 'false')
    expect(dock()).toBeNull()
  })

  it('quitter le CRM pendant un appel demande confirmation puis raccroche', async () => {
    renderCrm(new CallDockStore(0))
    await callFromDesk()
    fireEvent.click(screen.getByRole('link', { name: 'Aller aux projets' }))
    expect(confirm).toHaveBeenCalledTimes(1)
    await screen.findByText('Projets')
    await waitFor(() => expect(hangups()).toHaveLength(1))
    await waitFor(() => expect(softphone.getSnapshot().phase).toBe('idle'))
  })

  it('l’espace du commercial externe garde son propre softphone, sans dock', async () => {
    render(
      <MemoryRouter initialEntries={['/commercial/calls']}>
        <CommercialCalls />
      </MemoryRouter>,
    )
    await callFromDesk()
    expect(requests.some((item) => item.path === '/api/commercial/calls/config')).toBe(true)
    expect(requests.some((item) => item.path.startsWith('/api/admin/call-desk'))).toBe(false)
    expect(dock()).toBeNull()
    expect(document.querySelector('.crm-call-dock')).toBeNull()
  })
})
