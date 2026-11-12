import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analysisFixture, transcriptFixture } from '../../../components/calls/callInsights.fixtures'
import type { LeadCall } from '../../../services/calls'
import type { Lead } from '../../../types/crm.types'
import { apiFetch } from '../../../lib/api'
import LeadDetailPage from './LeadDetailPage'

const PREFIX = '/api/admin/call-desk'

vi.mock('../../../components/admin/InteractionTimeline', () => ({ default: () => null }))
vi.mock('../../../components/admin/RevenueChain', () => ({ default: () => null }))
vi.mock('../../../lib/api', async () => ({ ...(await vi.importActual<object>('../../../lib/api')), apiFetch: vi.fn() }))

const clone = <T,>(value: T): T => structuredClone(value)
const calls: LeadCall[] = [
  {
    _id: 'call-ext',
    author: { _id: 'rep1', name: 'Camille Externe' },
    own: false,
    status: 'COMPLETED',
    startedAt: '2026-11-11T10:00:00.000Z',
    answeredAt: '2026-11-11T10:00:08.000Z',
    endedAt: '2026-11-11T10:06:50.000Z',
    durationSec: 402,
    recording: { status: 'DELETED', objection: false },
    transcriptStatus: 'DONE',
    analysisStatus: 'READY',
  },
  {
    _id: 'call-own',
    author: { _id: 'admin1', name: 'Admin' },
    own: true,
    status: 'NO_ANSWER',
    startedAt: '2026-11-12T10:00:00.000Z',
    answeredAt: null,
    endedAt: '2026-11-12T10:00:30.000Z',
    durationSec: 0,
    recording: { status: 'NONE', objection: false },
    transcriptStatus: null,
    analysisStatus: null,
  },
]
const requests: { path: string; method: string; body: unknown }[] = []
let analysis = clone(analysisFixture)

function installApi() {
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    requests.push({ path, method, body: options?.body ? JSON.parse(String(options.body)) : undefined })
    if (path === `${PREFIX}/calls/config`)
      return { enabled: true, callerId: '+33100000000', callingHours: null, attemptCap: 3 }
    if (path === `${PREFIX}/leads/lead1/calls`) return { calls: clone(calls) }
    if (path === `${PREFIX}/calls/call-ext/transcript`) return clone(transcriptFixture)
    if (path === `${PREFIX}/calls/call-ext/analysis`) return clone(analysis)
    if (path === `${PREFIX}/calls/call-ext/analysis/apply`) return { lead: {}, analysis: analysis.analysis }
    if (path === `${PREFIX}/calls/call-ext/analysis/opt-out`) return { lead: {} }
    if (path === '/api/admin/crm/leads/lead1')
      return { lead: { _id: 'lead1', company: 'Atelier Alpha', status: 'LEAD' } }
    return { duplicates: [] }
  }) as typeof apiFetch)
}

const baseLead: Lead = {
  _id: 'lead1',
  company: 'Atelier Alpha',
  status: 'LEAD',
  contactName: 'Alice',
  contactPhone: '+33612345678',
  closingHandoff: { at: '2026-11-11T12:00:00.000Z' },
}

function mount(props: { canManageCrm: boolean; lead?: Lead; focusCall?: boolean; onLeadChange?: () => void }) {
  return render(
    <MemoryRouter>
      <LeadDetailPage
        lead={props.lead ?? baseLead}
        admins={[]}
        canManageCrm={props.canManageCrm}
        converting={null}
        onClose={vi.fn()}
        onLeadChange={props.onLeadChange ?? vi.fn()}
        onUpdateLead={vi.fn()}
        onConvertToClient={vi.fn()}
        focusCall={props.focusCall}
      />
    </MemoryRouter>,
  )
}
const openCalls = () => fireEvent.click(screen.getByRole('tab', { name: 'Appels et analyses' }))
const sentToTeam = (suffix: string) => requests.find((item) => item.path === `${PREFIX}${suffix}`)

describe('Fiche du lead de l’équipe — appels', () => {
  beforeEach(() => {
    requests.length = 0
    analysis = clone(analysisFixture)
    vi.stubGlobal('RTCPeerConnection', class {})
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(), enumerateDevices: vi.fn(async () => []) },
    })
    installApi()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('met la barre d’appel à la place du lien tel: quand on a le droit d’appeler', async () => {
    mount({ canManageCrm: true })
    expect(await screen.findByRole('group', { name: 'Appel téléphonique' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Appeler depuis le navigateur' })).toBeInTheDocument()
    expect(document.querySelector('a[href^="tel:"]')).toBeNull()
    expect(requests.map((item) => item.path)).toContain(`${PREFIX}/calls/config`)
  })

  it('ne montre ni barre ni lien d’appel sans la permission d’appeler, et ne lit pas la téléphonie', async () => {
    mount({ canManageCrm: false })
    await screen.findByRole('heading', { name: 'Atelier Alpha' })
    expect(screen.queryByRole('group', { name: 'Appel téléphonique' })).not.toBeInTheDocument()
    expect(document.querySelector('a[href^="tel:"]')).toBeNull()
    expect(requests.some((item) => item.path.endsWith('/calls/config'))).toBe(false)
  })

  it('met l’appel à portée de clavier quand la fiche est ouverte depuis la file de travail, sans composer', async () => {
    mount({ canManageCrm: true, focusCall: true })
    const button = await screen.findByRole('button', { name: 'Appeler depuis le navigateur' })
    await waitFor(() => expect(button).toHaveFocus())
    expect(requests.some((item) => item.path.endsWith('/token') || item.method === 'POST')).toBe(false)
  })

  it('liste les appels, avec le nom du commercial externe sur une fiche transmise', async () => {
    mount({ canManageCrm: true })
    openCalls()
    const row = await screen.findByRole('button', { name: /6:42/ })
    expect(row).toHaveTextContent('Appel de Camille Externe')
    expect(screen.queryByText('Appel de Admin')).not.toBeInTheDocument()
    expect(sentToTeam('/leads/lead1/calls')).toBeDefined()
  })

  it('laisse l’équipe valider l’analyse d’un appel d’un externe, puis recharge la fiche', async () => {
    const onLeadChange = vi.fn()
    mount({ canManageCrm: true, onLeadChange })
    openCalls()
    fireEvent.click(await screen.findByRole('button', { name: /6:42/ }))
    const budget = await screen.findByRole('group', { name: 'Décision pour : Budget' })
    fireEvent.click(within(budget).getByRole('button', { name: 'Accepter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer la sélection' }))
    await waitFor(() => expect(sentToTeam('/calls/call-ext/analysis/apply')).toBeDefined())
    await waitFor(() => expect(onLeadChange).toHaveBeenCalled())
  })

  it('montre appels, transcript et analyse sans geste de validation sans la permission', async () => {
    mount({ canManageCrm: false })
    openCalls()
    fireEvent.click(await screen.findByRole('button', { name: /6:42/ }))
    expect(await screen.findByText('Résumé de l’appel')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Appliquer la sélection' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accepter' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Conversation' }))
    expect(await screen.findByText(/Je vous appelle suite à votre demande/)).toBeInTheDocument()
  })

  it('demande confirmation avant de lever la retenue, en disant ce que cela autorise', async () => {
    analysis.analysis.output!.optOut = { detected: true, quote: 'ne me rappelez plus' }
    analysis.current.callHold = { at: '2026-11-12T10:07:00.000Z', reason: 'OPT_OUT_DETECTED' }
    mount({
      canManageCrm: true,
      lead: { ...baseLead, callHold: { at: '2026-11-12T10:07:00.000Z', reason: 'OPT_OUT' } },
    })
    expect(screen.getByText('Fiche retenue.', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Appeler depuis le navigateur' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les appels' }))
    fireEvent.click(await screen.findByRole('button', { name: /6:42/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Lever la retenue' }))
    const dialog = await screen.findByText(/sera de nouveau appelable/)
    expect(dialog).toBeInTheDocument()
    expect(sentToTeam('/calls/call-ext/analysis/opt-out')).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: 'Oui, lever la retenue' }))
    await waitFor(() => expect(sentToTeam('/calls/call-ext/analysis/opt-out')?.body).toEqual({ action: 'DISMISS' }))
  })

  it('n’offre pas la levée de la retenue sans la permission', async () => {
    analysis.analysis.output!.optOut = { detected: true, quote: 'ne me rappelez plus' }
    analysis.current.callHold = { at: '2026-11-12T10:07:00.000Z', reason: 'OPT_OUT_DETECTED' }
    mount({ canManageCrm: false })
    openCalls()
    fireEvent.click(await screen.findByRole('button', { name: /6:42/ }))
    await screen.findByText('Résumé de l’appel')
    expect(screen.queryByRole('button', { name: 'Lever la retenue' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmer : ne plus appeler/ })).not.toBeInTheDocument()
  })
})
