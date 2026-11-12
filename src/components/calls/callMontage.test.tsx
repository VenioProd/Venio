import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, ApiError } from '../../lib/api'
import type { LeadCall } from '../../services/calls'
import type { AnalysisResponse, CallTranscript } from '../../services/callInsights'
import CallInsights from './CallInsights'
import LeadCallsList from './LeadCallsList'
import { analysisFixture, transcriptFixture } from './callInsights.fixtures'

vi.mock('../../lib/api', async () => ({ ...(await vi.importActual<object>('../../lib/api')), apiFetch: vi.fn() }))

const clone = <T,>(value: T): T => structuredClone(value)
const notFound = () => new ApiError(404, 'Not found', { error: 'NOT_FOUND' })

const call = (change: Partial<LeadCall> = {}): LeadCall => ({
  _id: 'call1',
  status: 'COMPLETED',
  startedAt: '2026-11-12T10:00:00.000Z',
  answeredAt: '2026-11-12T10:00:08.000Z',
  endedAt: '2026-11-12T10:06:50.000Z',
  durationSec: 402,
  recording: { status: 'DELETED', objection: false },
  transcriptStatus: 'DONE',
  analysisStatus: 'READY',
  ...change,
})

interface Server {
  calls: LeadCall[]
  transcript: CallTranscript | null
  analysis: AnalysisResponse | null
  requests: { path: string; method: string; body: Record<string, unknown> | null }[]
  failure: ApiError | null
}
let server: Server

beforeEach(() => {
  server = {
    calls: [call()],
    transcript: clone(transcriptFixture),
    analysis: clone(analysisFixture),
    requests: [],
    failure: null,
  }
  vi.mocked(apiFetch).mockReset()
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    const body = options?.body ? (JSON.parse(String(options.body)) as Record<string, unknown>) : null
    server.requests.push({ path, method, body })
    if (path === '/api/commercial/leads/lead1/calls') return { calls: clone(server.calls) }
    if (path.endsWith('/transcript')) {
      if (!server.transcript) throw notFound()
      return clone(server.transcript)
    }
    if (path.endsWith('/analysis/opt-out')) return { lead: {} }
    if (path.endsWith('/analysis/apply')) {
      if (server.failure) throw server.failure
      server.analysis!.analysis.status = 'APPLIED'
      return { lead: {}, analysis: server.analysis!.analysis }
    }
    if (path.endsWith('/analysis')) {
      if (!server.analysis) throw notFound()
      return clone(server.analysis)
    }
    throw new Error(`Unexpected path: ${path}`)
  }) as typeof apiFetch)
})

describe('LeadCallsList', () => {
  it('liste les appels de la fiche avec date, durée, audio, transcript et analyse, et ouvre l’analyse', async () => {
    const onApplied = vi.fn()
    render(<LeadCallsList leadId="lead1" onApplied={onApplied} />)

    const row = await screen.findByRole('button', { name: /6:42/ })
    expect(row).toHaveTextContent('Audio : supprimé')
    expect(row).toHaveTextContent('Transcript : prêt')
    expect(row).toHaveTextContent('Analyse : à valider')
    expect(row).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(row)
    expect(await screen.findByText('Résumé de l’appel')).toBeInTheDocument()
    // L'audio n'est plus conservé : on le dit, sans lecteur.
    expect(screen.getByText(/audio a été supprimé après la transcription/)).toBeInTheDocument()
    expect(document.querySelector('audio')).toBeNull()

    const budget = screen.getByRole('group', { name: 'Décision pour : Budget' })
    fireEvent.click(within(budget).getByRole('button', { name: 'Accepter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer la sélection' }))
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1))
    // La liste est relue après l'application.
    await waitFor(() =>
      expect(
        server.requests.filter((item) => item.path === '/api/commercial/leads/lead1/calls').length,
      ).toBeGreaterThan(1),
    )
  })

  it('joue l’audio relayé par Venio quand il est conservé, et dit quand il a été arrêté ou n’existe pas', async () => {
    server.calls = [
      call({ _id: 'call1', recording: { status: 'READY', objection: false } }),
      call({
        _id: 'call2',
        recording: { status: 'STOPPED', objection: true },
        transcriptStatus: null,
        analysisStatus: null,
      }),
      call({
        _id: 'call3',
        status: 'NO_ANSWER',
        answeredAt: null,
        durationSec: 0,
        recording: { status: 'NONE', objection: false },
        transcriptStatus: null,
        analysisStatus: null,
      }),
    ]
    render(<LeadCallsList leadId="lead1" />)
    const rows = await screen.findAllByRole('button', { name: /Audio|Transcript/ })
    // L'appel sans réponse n'a rien à ouvrir.
    expect(rows).toHaveLength(2)

    fireEvent.click(rows[0])
    await waitFor(() => expect(document.querySelector('audio')).not.toBeNull())
    expect(document.querySelector('audio')).toHaveAttribute('src', '/api/commercial/calls/call1/recording')

    fireEvent.click(rows[1])
    expect(await screen.findByText(/arrêté à la demande du prospect : rien n’a été conservé/)).toBeInTheDocument()
  })

  it('utilise le préfixe d’API qu’on lui donne', async () => {
    render(<LeadCallsList leadId="lead1" apiPrefix="/api/admin/crm" />)
    await waitFor(() => expect(server.requests.map((item) => item.path)).toContain('/api/admin/crm/leads/lead1/calls'))
  })
})

describe('CallInsights — alignements sur le serveur', () => {
  const mount = (props: Partial<React.ComponentProps<typeof CallInsights>> = {}) =>
    render(<CallInsights callId="call1" pollMs={0} {...props} />)

  it('grise les champs réservés à l’équipe et ne les compte pas comme à décider', async () => {
    server.analysis!.acceptableKeys = ['budget', 'contactEmail']
    mount()
    const size = await screen.findByRole('listitem', { name: 'Taille de l’entreprise' })
    expect(within(size).getByText(/revient à l’équipe/)).toBeInTheDocument()
    expect(within(size).queryByRole('button', { name: 'Accepter' })).not.toBeInTheDocument()
    expect(within(size).queryByRole('button', { name: 'Modifier puis accepter' })).not.toBeInTheDocument()
    // Un champ de l'externe garde ses gestes.
    expect(
      within(screen.getByRole('listitem', { name: 'Budget' })).getByRole('button', { name: 'Accepter' }),
    ).toBeEnabled()
    // 7 champs dont 5 réservés (expectedCloseAt, serviceType, decisionMaker, competitors, companySize) : 2 + chaleur + 3 actions à décider.
    expect(screen.getByText(/0 à appliquer · 0 ignorée\(s\) · 6 à décider/)).toBeInTheDocument()
  })

  it('n’accepte pas les actions SEQUENCE et HANDOFF, que le serveur refuse', async () => {
    server.analysis!.analysis.output!.actions = [
      { id: 'a1', type: 'SEQUENCE', label: 'Inscrire à la séquence bienvenue', dueAt: null, reason: 'Intéressée' },
      { id: 'a2', type: 'HANDOFF', label: 'Passer au closer', dueAt: null, reason: 'Veut un devis' },
      { id: 'a3', type: 'CALL', label: 'Rappeler mardi', dueAt: '2099-01-05T10:00:00.000Z', reason: 'Convenu' },
    ]
    mount()
    const sequence = await screen.findByRole('group', { name: /Décision pour l’action : Inscrire à la séquence/ })
    expect(within(sequence).getByRole('button', { name: 'Accepter' })).toBeDisabled()
    const handoff = screen.getByRole('group', { name: /Décision pour l’action : Passer au closer/ })
    expect(within(handoff).getByRole('button', { name: 'Accepter' })).toBeDisabled()
    expect(screen.getAllByText(/n’est pas encore exécutable/)).toHaveLength(2)

    fireEvent.click(
      within(screen.getByRole('group', { name: /Décision pour l’action : Rappeler mardi/ })).getByRole('button', {
        name: 'Accepter',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer la sélection' }))
    await waitFor(() => expect(server.requests.some((item) => item.path.endsWith('/analysis/apply'))).toBe(true))
    const body = server.requests.find((item) => item.path.endsWith('/analysis/apply'))!.body as {
      actions: { id: string; action: string }[]
    }
    expect(body.actions.map((item) => [item.id, item.action])).toEqual([
      ['a1', 'IGNORE'],
      ['a2', 'IGNORE'],
      ['a3', 'ACCEPT'],
    ])
  })

  it('envoie le libellé d’une action quand il a été modifié', async () => {
    mount()
    const label = await screen.findAllByLabelText('Libellé')
    fireEvent.change(label[0], { target: { value: 'Cadrage avec M. Brun et Mme Lefèvre' } })
    fireEvent.click(
      within(screen.getByRole('group', { name: /Décision pour l’action : Rendez-vous de cadrage/ })).getByRole(
        'button',
        {
          name: 'Accepter',
        },
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer la sélection' }))
    await waitFor(() => expect(server.requests.some((item) => item.path.endsWith('/analysis/apply'))).toBe(true))
    const body = server.requests.find((item) => item.path.endsWith('/analysis/apply'))!.body as {
      actions: { id: string; action: string; label?: string }[]
    }
    expect(body.actions[0]).toMatchObject({ id: 'a1', action: 'ACCEPT', label: 'Cadrage avec M. Brun et Mme Lefèvre' })
    expect(body.actions[1]).toEqual({ id: 'a2', action: 'IGNORE' })
  })

  it.each([
    ['QUOTE_NOT_VERIFIED', 400, /citation de « Budget » est introuvable/],
    ['FIELD_NOT_ALLOWED', 403, /« Budget » est réservé à l’équipe/],
    ['LEAD_HANDED_OFF', 409, /transmise au closer/],
    ['ANALYSIS_ALREADY_REVIEWED', 409, /déjà été relue/],
    ['ACTION_DUE_REQUIRED', 400, /échéance à venir/],
  ])('rend lisible le code %s renvoyé par apply', async (code, status, text) => {
    // Forme réelle du serveur : `error` porte un message en clair, `code` le code.
    server.failure = new ApiError(status, 'Message du serveur', { error: 'Message du serveur', code, key: 'budget' })
    mount()
    fireEvent.click(
      within(await screen.findByRole('group', { name: 'Décision pour : Budget' })).getByRole('button', {
        name: 'Accepter',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer la sélection' }))
    expect(await screen.findByText(text)).toBeInTheDocument()
  })

  it('relit l’analyse quand elle a déjà été relue ailleurs', async () => {
    server.failure = new ApiError(409, 'Analyse déjà relue', {
      error: 'Analyse déjà relue',
      code: 'ANALYSIS_ALREADY_REVIEWED',
    })
    mount()
    fireEvent.click(
      within(await screen.findByRole('group', { name: 'Décision pour : Budget' })).getByRole('button', {
        name: 'Accepter',
      }),
    )
    server.analysis!.analysis.status = 'REJECTED'
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer la sélection' }))
    expect(await screen.findByText(/Analyse rejetée/)).toBeInTheDocument()
  })

  it('l’externe confirme une opposition mais ne peut pas lever la retenue, et le dit', async () => {
    server.analysis!.analysis.output!.optOut = { detected: true, quote: 'ne me rappelez plus' }
    server.analysis!.current.callHold = { at: '2026-11-12T10:07:00.000Z', reason: 'OPT_OUT_DETECTED' }
    const onApplied = vi.fn()
    mount({ onApplied })
    expect(await screen.findByText(/ne sera pas rappelée tant que l’opposition/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lever la retenue' })).not.toBeInTheDocument()
    expect(screen.getByText(/Lever la retenue revient à l’équipe/)).toBeInTheDocument()

    server.analysis!.current.callHold = null
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer : ne plus appeler' }))
    expect(await screen.findByText(/Opposition confirmée/)).toBeInTheDocument()
    const sent = server.requests.find((item) => item.path.endsWith('/analysis/opt-out'))
    expect(sent).toMatchObject({ method: 'POST', body: { action: 'CONFIRM' } })
    await waitFor(() => expect(onApplied).toHaveBeenCalled())
  })

  it('laisse l’équipe lever la retenue quand le lot équipe le demande', async () => {
    server.analysis!.analysis.output!.optOut = { detected: true, quote: 'ne me rappelez plus' }
    server.analysis!.current.callHold = { at: '2026-11-12T10:07:00.000Z', reason: 'OPT_OUT_DETECTED' }
    mount({ canLiftHold: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Lever la retenue' }))
    // La confirmation dit ce que cela autorise, et rien ne part avant elle.
    expect(await screen.findByText(/sera de nouveau appelable/)).toBeInTheDocument()
    expect(server.requests.some((item) => item.path.endsWith('/analysis/opt-out'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Oui, lever la retenue' }))
    expect(await screen.findByText(/Retenue levée/)).toBeInTheDocument()
    expect(server.requests.find((item) => item.path.endsWith('/analysis/opt-out'))?.body).toEqual({ action: 'DISMISS' })
  })
})
