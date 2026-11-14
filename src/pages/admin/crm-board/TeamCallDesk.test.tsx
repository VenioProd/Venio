import { EventEmitter } from 'events'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../../../lib/api'
import { softphone } from '../../commercial/softphone/engine'
import TeamCallDesk from './TeamCallDesk'

const sdk = vi.hoisted(() => ({ call: null as unknown, connect: null as unknown }))

vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'admin1', name: 'Admin' } }) }))
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

const PREFIX = '/api/admin/call-desk'
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
  scriptTags: ['Site vitrine'],
  defaultRegion: 'FR',
  outcomes: [
    { value: 'NRP', fr: 'Pas de réponse', en: 'No answer', effect: 'NONE', reached: false, retryAfterMinutes: null },
    { value: 'RDV', fr: 'Rendez-vous', en: 'Meeting', effect: 'MEETING', reached: true, retryAfterMinutes: null },
  ],
}
const requests: { path: string; method: string; body: unknown }[] = []

function installApi(
  overrides: {
    leads?: unknown[]
    filters?: { lists: string[]; projects: string[] }
    settings?: typeof settings
    telephony?: boolean
  } = {},
) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    requests.push({ path, method, body: options?.body ? JSON.parse(String(options.body)) : undefined })
    if (path === `${PREFIX}/calls/settings`) return overrides.settings ?? settings
    if (path === `${PREFIX}/calls/filters`) return overrides.filters ?? { lists: [], projects: [] }
    if (path.startsWith(`${PREFIX}/calls/queue`)) return { leads: overrides.leads ?? [lead], nextCursor: null }
    if (path === '/api/admin/interactions/LEAD/lead1/timeline?limit=5')
      return {
        entries: [
          {
            id: 'i1',
            source: 'INTERACTION',
            kind: 'CALL',
            direction: 'OUT',
            occurredAt: '2026-11-10T09:00:00.000Z',
            label: 'Appel',
            body: 'Rappeler jeudi',
          },
          { id: 's1', source: 'SYSTEM', kind: 'STATUS', direction: 'NONE', occurredAt: '', label: 'Statut', body: '' },
        ],
      }
    if (path === `${PREFIX}/calls/config`)
      return { enabled: overrides.telephony ?? true, callerId: '+33100000000', callingHours: null, attemptCap: 3 }
    if (path === `${PREFIX}/calls/token`)
      return { token: 'jwt', identity: 'admin1', expiresAt: new Date(Date.now() + 600_000).toISOString() }
    if (path === `${PREFIX}/leads/lead1/calls`) return method === 'POST' ? { callId: 'call1' } : { calls: [] }
    if (path === `${PREFIX}/calls/call1/hangup`) return { status: 'COMPLETED' }
    if (path === `${PREFIX}/calls/call1`)
      return { _id: 'call1', lead: 'lead1', status: 'NO_ANSWER', durationSec: 0, suggestedOutcome: 'NRP' }
    if (path === `${PREFIX}/leads/lead1/quick-call`) return { interactionId: 'interaction1' }
    if (path === `${PREFIX}/calls/script-tags`) return { scriptTags: [...settings.scriptTags, 'Relance devis'] }
    throw new Error(`Unexpected path: ${path}`)
  }) as typeof apiFetch)
}

const renderDesk = () =>
  render(
    <MemoryRouter>
      <TeamCallDesk />
    </MemoryRouter>,
  )
const queueRequests = () => requests.filter((item) => item.path.startsWith(`${PREFIX}/calls/queue`))
const lastQueuePath = () => queueRequests().slice(-1)[0]?.path

describe('File d’appels de l’équipe', () => {
  beforeEach(() => {
    requests.length = 0
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
    installApi()
  })
  afterEach(async () => {
    cleanup()
    await waitFor(() => expect(softphone.getSnapshot().phase).toBe('idle'))
    softphone.dismiss()
    softphone.retry()
    vi.unstubAllGlobals()
  })

  it('lit la file de l’équipe sans import de listes ; ajoute une étiquette de script par son routeur', async () => {
    renderDesk()
    expect(await screen.findByRole('button', { name: /Atelier Alpha/ })).toBeInTheDocument()
    expect(requests.map((item) => item.path)).toEqual(
      expect.arrayContaining([`${PREFIX}/calls/settings`, `${PREFIX}/calls/filters`]),
    )
    expect(requests.some((item) => item.path.startsWith('/api/commercial'))).toBe(false)
    expect(screen.getByRole('heading', { level: 1, name: 'Poste d’appel' })).toBeInTheDocument()
    expect(screen.queryByText(/Importer/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Atelier Alpha/ }))
    await screen.findByRole('group', { name: 'Appel téléphonique' })
    // Le serveur monte l'ajout pour l'équipe (MANAGE_CRM, que l'onglet exige) : l'écran le propose.
    fireEvent.change(screen.getByLabelText('Ajouter un script'), { target: { value: 'Relance devis' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un script' }))
    await waitFor(() =>
      expect(requests.find((item) => item.path === `${PREFIX}/calls/script-tags`)).toMatchObject({
        method: 'POST',
        body: { tag: 'Relance devis' },
      }),
    )
  })

  it('bascule entre « mes fiches » et « tout mon périmètre » en relisant la file', async () => {
    renderDesk()
    await screen.findByRole('button', { name: /Atelier Alpha/ })
    expect(lastQueuePath()).toContain('mine=1')
    const scope = screen.getByRole('group', { name: 'Périmètre de la file' })
    expect(within(scope).getByRole('button', { name: 'Mes fiches' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(within(scope).getByRole('button', { name: 'Tout mon périmètre' }))
    await waitFor(() => expect(lastQueuePath()).toContain('mine=0'))
    expect(within(scope).getByRole('button', { name: 'Tout mon périmètre' })).toHaveAttribute('aria-pressed', 'true')
    await screen.findByRole('button', { name: /Atelier Alpha/ })

    fireEvent.click(within(scope).getByRole('button', { name: 'Mes fiches' }))
    await waitFor(() => expect(lastQueuePath()).toContain('mine=1'))
  })

  it('montre l’historique de la fiche d’après le journal des échanges de l’équipe', async () => {
    renderDesk()
    fireEvent.click(await screen.findByRole('button', { name: /Atelier Alpha/ }))
    expect(await screen.findByText('Rappeler jeudi')).toBeInTheDocument()
    expect(screen.queryByText('Statut')).not.toBeInTheDocument()
  })

  it('appelle par le routeur de l’équipe et envoie le callId avec la fiche', async () => {
    renderDesk()
    fireEvent.click(await screen.findByRole('button', { name: /Atelier Alpha/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Appeler depuis le navigateur' }))
    await waitFor(() => expect(sdk.connect).toHaveBeenCalledWith({ params: { callId: 'call1' } }))
    expect(requests.some((item) => item.path === `${PREFIX}/calls/token`)).toBe(true)
    expect(requests.some((item) => item.path.startsWith('/api/commercial'))).toBe(false)

    ;(sdk.call as EventEmitter).emit('accept')
    fireEvent.click(await screen.findByRole('button', { name: 'Raccrocher' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Pas de réponse/ })).toHaveAttribute('aria-pressed', 'true'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et suivant' }))
    await waitFor(() => expect(requests.some((item) => item.path === `${PREFIX}/leads/lead1/quick-call`)).toBe(true))
    expect(requests.find((item) => item.path.endsWith('/quick-call'))?.body).toMatchObject({
      callId: 'call1',
      outcome: 'NRP',
    })
  })
  it('présente le choix du mode en trois cartes (boutons radio), « Au clic » par défaut', async () => {
    renderDesk()
    await screen.findByRole('button', { name: /Atelier Alpha/ })
    const modes = screen.getByRole('group', { name: 'Mode d’appel' })
    expect(within(modes).getByRole('radio', { name: /Au clic/ })).toBeChecked()
    expect(within(modes).getByRole('radio', { name: /Au clic/ })).toBeEnabled()
    expect(within(modes).getByRole('radio', { name: /Aperçu/ })).toBeEnabled()
    expect(within(modes).getByRole('radio', { name: /Power dialer/ })).toBeEnabled()
  })

  it('téléphonie non configurée : seule la carte « Au clic » reste active, les autres disent pourquoi', async () => {
    installApi({ telephony: false })
    renderDesk()
    await screen.findByRole('button', { name: /Atelier Alpha/ })
    const modes = screen.getByRole('group', { name: 'Mode d’appel' })
    await waitFor(() => expect(within(modes).getByRole('radio', { name: /Power dialer/ })).toBeDisabled())
    expect(within(modes).getByRole('radio', { name: /Aperçu/ })).toBeDisabled()
    expect(within(modes).getByRole('radio', { name: /Au clic/ })).toBeEnabled()
    expect(
      within(modes).getAllByText(/Indisponible : les appels depuis le navigateur ne sont pas actifs/),
    ).toHaveLength(2)
  })

  it('met les filtres en gélules et relit la file avec la liste choisie', async () => {
    installApi({ filters: { lists: ['Salon', 'Novembre'], projects: ['VENIO'] } })
    renderDesk()
    await screen.findByRole('button', { name: /Atelier Alpha/ })
    const lists = screen.getByRole('group', { name: 'Liste' })
    expect(within(lists).getByRole('button', { name: 'Toutes les listes' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(lists).getByRole('button', { name: 'Salon' }))
    await waitFor(() => expect(lastQueuePath()).toContain('callList=Salon'))
    expect(within(lists).getByRole('button', { name: 'Salon' })).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(screen.getByRole('group', { name: 'Projet' })).getByRole('button', { name: 'VENIO' }),
    ).toBeInTheDocument()
  })

  it('montre les puces d’état de la ligne : répondeur, hors plage chez le prospect, pays et heure locale, fiche retenue', async () => {
    installApi({
      settings: {
        ...settings,
        outcomes: [
          ...settings.outcomes,
          {
            value: 'VM',
            fr: 'Messagerie',
            en: 'Voicemail',
            effect: 'VOICEMAIL',
            reached: false,
            retryAfterMinutes: null,
          },
        ],
      },
      leads: [
        {
          ...lead,
          lastCallOutcome: 'VM',
          callHold: { at: '2026-11-10T09:00:00.000Z', reason: 'OPT_OUT' },
          callCheck: { country: 'GP', timeZones: ['America/Guadeloupe'], block: 'OUTSIDE_CALLING_HOURS' },
        },
      ],
    })
    renderDesk()
    const row = await screen.findByRole('button', { name: /Atelier Alpha/ })
    expect(within(row).getByText('GP')).toBeInTheDocument()
    expect(within(row).getByText('Répondeur au dernier appel')).toBeInTheDocument()
    expect(within(row).getByText('Hors plage chez le prospect')).toBeInTheDocument()
    expect(within(row).getByText('Retenue')).toBeInTheDocument()
    expect(row.querySelector('time')).not.toBeNull()
  })

  it('garde les raccourcis de la grille : Alt+chiffre choisit le résultat, Entrée enregistre', async () => {
    renderDesk()
    fireEvent.click(await screen.findByRole('button', { name: /Atelier Alpha/ }))
    const notes = await screen.findByRole('textbox', { name: /Notes/ })
    fireEvent.keyDown(notes, { altKey: true, code: 'Digit2', key: '2' })
    expect(screen.getByRole('button', { name: /^Rendez-vous/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(notes, { key: 'Enter' })
    await waitFor(() =>
      expect(requests.find((item) => item.path.endsWith('/quick-call'))?.body).toMatchObject({ outcome: 'RDV' }),
    )
  })
})
