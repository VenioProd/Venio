import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, ApiError } from '../../lib/api'
import type { AnalysisResponse, CallTranscript } from '../../services/callInsights'
import CallInsights from './CallInsights'
import { analysisFixture, transcriptFixture } from './callInsights.fixtures'

vi.mock('../../lib/api', async () => ({ ...(await vi.importActual<object>('../../lib/api')), apiFetch: vi.fn() }))

const notFound = () => new ApiError(404, 'Not found', { error: 'NOT_FOUND' })
const clone = <T,>(value: T): T => structuredClone(value)

interface Server {
  transcript: CallTranscript | null
  analysis: AnalysisResponse | null
  calls: { path: string; body: Record<string, unknown> | null }[]
  applyFailures: number
}
let server: Server

function mount(pollMs = 0) {
  return render(<CallInsights callId="call1" pollMs={pollMs} />)
}

beforeEach(() => {
  server = { transcript: clone(transcriptFixture), analysis: clone(analysisFixture), calls: [], applyFailures: 0 }
  vi.mocked(apiFetch).mockReset()
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: RequestInit) => {
    const body = options?.body ? (JSON.parse(String(options.body)) as Record<string, unknown>) : null
    if (options?.method === 'POST') server.calls.push({ path, body })
    if (path === '/api/commercial/calls/call1/transcript') {
      if (!server.transcript) throw notFound()
      return clone(server.transcript)
    }
    if (path === '/api/commercial/calls/call1/analysis') {
      if (!server.analysis) throw notFound()
      return clone(server.analysis)
    }
    if (path.endsWith('/analysis/apply')) {
      if (server.applyFailures > 0) {
        server.applyFailures--
        throw new ApiError(500, 'boom', null)
      }
      server.analysis!.analysis.status = 'PARTIAL'
      server.analysis!.analysis.review = {
        by: { _id: 'u1', name: 'Clara Roux' },
        at: '2026-11-12T14:32:00.000Z',
        decisions: [],
      }
      return { lead: {}, analysis: server.analysis!.analysis }
    }
    if (path.endsWith('/analysis/reject')) {
      server.analysis!.analysis.status = 'REJECTED'
      return { analysis: server.analysis!.analysis }
    }
    if (path.endsWith('/analysis/retry')) {
      server.analysis!.analysis.status = 'PENDING'
      return { analysis: server.analysis!.analysis }
    }
    throw new Error(`Unexpected path: ${path}`)
  }) as typeof apiFetch)
})

describe('CallInsights — attente et échec', () => {
  it('attend la transcription puis l’analyse, en relisant tout seul', async () => {
    server.transcript = { ...clone(transcriptFixture), status: 'PROCESSING', segments: [] }
    server.analysis = null
    mount(20)
    expect(await screen.findByText(/Transcription en cours/)).toBeInTheDocument()

    server.transcript = clone(transcriptFixture)
    server.analysis = {
      ...clone(analysisFixture),
      analysis: { ...clone(analysisFixture).analysis, status: 'PENDING', output: null },
    }
    expect(await screen.findByText(/Analyse en cours/)).toBeInTheDocument()

    server.analysis = clone(analysisFixture)
    expect(await screen.findByText('Résumé de l’appel')).toBeInTheDocument()
  })

  it('propose de relancer une analyse en échec, puis attend le résultat', async () => {
    server.analysis = {
      ...clone(analysisFixture),
      analysis: { ...clone(analysisFixture).analysis, status: 'FAILED', output: null },
    }
    mount()
    expect(await screen.findByText(/L’analyse de cet appel a échoué/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Relancer l’analyse' }))
    expect(await screen.findByText(/Analyse en cours/)).toBeInTheDocument()
    expect(server.calls.map((call) => call.path)).toEqual(['/api/commercial/calls/call1/analysis/retry'])
  })

  it('dit simplement qu’il n’y a pas de transcript, et signale une transcription échouée', async () => {
    server.transcript = null
    server.analysis = null
    const { unmount } = mount()
    expect(await screen.findByText(/n’a pas de transcript/)).toBeInTheDocument()
    unmount()

    server.transcript = { ...clone(transcriptFixture), status: 'FAILED', segments: [] }
    mount()
    expect(await screen.findByText(/transcription de cet appel a échoué/)).toBeInTheDocument()
  })
})

describe('AnalysisReviewPanel — sélection et envoi', () => {
  it('n’applique rien sans geste, puis envoie la sélection en une fois avec le même clientRequestId en cas de nouvelle tentative', async () => {
    server.applyFailures = 1
    mount()
    const apply = await screen.findByRole('button', { name: 'Appliquer la sélection' })
    expect(apply).toBeDisabled()

    const budget = screen.getByRole('group', { name: 'Décision pour : Budget' })
    fireEvent.click(within(budget).getByRole('button', { name: 'Accepter' }))
    const sector = screen.getByRole('group', { name: 'Décision pour : Type de prestation' })
    fireEvent.click(within(sector).getByRole('button', { name: 'Ignorer' }))

    const email = screen.getByRole('group', { name: 'Décision pour : E-mail du contact' })
    fireEvent.click(within(email).getByRole('button', { name: 'Modifier puis accepter' }))
    fireEvent.change(screen.getByLabelText(/Valeur à enregistrer pour « E-mail du contact »/), {
      target: { value: 'claire@maison-lefevre.fr' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Valider la modification' }))

    fireEvent.click(screen.getByRole('button', { name: 'Accepter « Chaud »' }))
    const action = screen.getByRole('group', { name: /Décision pour l’action : Rendez-vous de cadrage/ })
    fireEvent.click(within(action).getByRole('button', { name: 'Accepter' }))

    expect(screen.getByText(/4 à appliquer · 1 ignorée\(s\) · 6 à décider/)).toBeInTheDocument()
    expect(apply).toBeEnabled()

    fireEvent.click(apply)
    expect(await screen.findByText(/n’a pas pu être appliquée/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer la sélection' }))
    expect(await screen.findByText(/validée par Clara Roux le/)).toBeInTheDocument()

    const sent = server.calls.filter((call) => call.path.endsWith('/analysis/apply'))
    expect(sent).toHaveLength(2)
    expect(sent[0].body!.clientRequestId).toBeTruthy()
    expect(sent[1].body!.clientRequestId).toBe(sent[0].body!.clientRequestId)

    const body = sent[1].body as {
      fields: { key: string; action: string; value?: unknown }[]
      heat: unknown
      actions: { id: string; action: string; dueAt?: string | null }[]
    }
    expect(body.fields.find((f) => f.key === 'budget')).toEqual({ key: 'budget', action: 'ACCEPT' })
    expect(body.fields.find((f) => f.key === 'serviceType')).toEqual({ key: 'serviceType', action: 'IGNORE' })
    expect(body.fields.find((f) => f.key === 'contactEmail')).toEqual({
      key: 'contactEmail',
      action: 'EDIT',
      value: 'claire@maison-lefevre.fr',
    })
    // Ce qui n'a pas été tranché n'écrit rien.
    expect(body.fields.find((f) => f.key === 'qualification.competitors')).toEqual({
      key: 'qualification.competitors',
      action: 'IGNORE',
    })
    expect(body.heat).toEqual({ action: 'ACCEPT' })
    expect(body.actions.map((a) => [a.id, a.action])).toEqual([
      ['a1', 'ACCEPT'],
      ['a2', 'IGNORE'],
      ['a3', 'IGNORE'],
    ])
  })

  it('bloque une citation non vérifiée : refus tel quel, acceptation possible seulement après modification', async () => {
    mount()
    const size = await screen.findByRole('group', { name: 'Décision pour : Taille de l’entreprise' })
    expect(screen.getByText(/Citation non retrouvée dans la conversation/)).toBeInTheDocument()
    expect(within(size).getByRole('button', { name: 'Accepter' })).toBeDisabled()

    fireEvent.click(within(size).getByRole('button', { name: 'Modifier puis accepter' }))
    fireEvent.change(screen.getByLabelText(/Valeur à enregistrer pour « Taille de l’entreprise »/), {
      target: { value: '11 à 50 salariés' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Valider la modification' }))
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer la sélection' }))

    await waitFor(() => expect(server.calls.some((call) => call.path.endsWith('/analysis/apply'))).toBe(true))
    const body = server.calls.find((call) => call.path.endsWith('/analysis/apply'))!.body as {
      fields: { key: string; action: string }[]
    }
    expect(body.fields.find((f) => f.key === 'companySize')).toMatchObject({
      action: 'EDIT',
      value: '11 à 50 salariés',
    })
  })

  it('distingue la valeur enregistrée de la valeur proposée', async () => {
    mount()
    await screen.findByText('Résumé de l’appel')
    const budget = screen.getByRole('listitem', { name: 'Budget' })
    expect(within(budget).getByText('Actuellement enregistré')).toBeInTheDocument()
    expect(within(budget).getByText('Proposition de l’analyse')).toBeInTheDocument()
    expect(budget.querySelector('.ci-current')).toHaveTextContent('8 000')
    expect(budget.querySelector('.ci-proposed')).toHaveTextContent('12 000')
  })

  it('rejette toute l’analyse après confirmation', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Rejeter l’analyse' }))
    expect(server.calls).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Oui, rejeter' }))
    expect(await screen.findByText(/Analyse rejetée/)).toBeInTheDocument()
    expect(server.calls.map((call) => call.path)).toEqual(['/api/commercial/calls/call1/analysis/reject'])
  })
})

describe('Opposition et transcript', () => {
  it('signale en priorité une opposition détectée, avec la citation', async () => {
    server.analysis!.analysis.output!.optOut = { detected: true, quote: 'ne me rappelez plus sur ce numéro' }
    mount()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('refuser d’être rappelé')
    expect(alert).toHaveTextContent('ne me rappelez plus sur ce numéro')
  })

  it('surligne la citation choisie dans la conversation et trouve les mots cherchés', async () => {
    const { container } = mount()
    const budget = await screen.findByRole('listitem', { name: 'Budget' })
    fireEvent.click(within(budget).getAllByRole('button', { name: 'Voir dans la conversation' })[0])
    await waitFor(() => expect(container.querySelector('.ci-mark-quote')).not.toBeNull())
    expect(container.querySelector('.ci-mark-quote')).toHaveTextContent('On a prévu autour de 12 000 euros')

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'THOMAS brun' } })
    expect(screen.getByText('Résultat 1 sur 1')).toBeInTheDocument()
    expect(container.querySelector('.ci-mark-hit')).toHaveTextContent('Thomas Brun')
  })

  it('annonce deux voix distinctes avec leur nom et un horodatage', async () => {
    mount()
    await screen.findByText('Résumé de l’appel')
    const first = screen.getAllByRole('listitem').find((item) => item.hasAttribute('data-segment'))!
    expect(first).toHaveTextContent('Commercial')
    expect(first).toHaveTextContent('0:02')
    expect(screen.getAllByText('Prospect').length).toBeGreaterThan(0)
  })
})
