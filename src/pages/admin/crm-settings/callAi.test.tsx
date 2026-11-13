import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CrmSettings from './index'
import { DEFAULT_ANALYSIS, analysisIssues, readAnalysis, readRecording, reachableTotal } from './callAiModel'

const apiFetch = vi.fn()
const auth = vi.hoisted(() => ({ role: 'ADMIN' }))
vi.mock('../../../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', role: auth.role } }) }))

let providers = { telephony: false, transcription: true, analysis: true }
let refuse: string | null = null

beforeEach(() => {
  auth.role = 'ADMIN'
  providers = { telephony: false, transcription: true, analysis: true }
  refuse = null
  apiFetch.mockReset()
  apiFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
    if (url === '/api/admin/crm/settings' && !opts?.method)
      return { settings: { weeklyReportRecipients: [] }, providers }
    if (url === '/api/admin/crm/settings' && opts?.method === 'PATCH') {
      if (refuse) throw new Error(refuse)
      return {}
    }
    if (url === '/api/admin/admins') return { users: [] }
    if (url.startsWith('/api/admin/crm/suppression')) return { entries: [], total: 0, page: 1, pages: 1 }
    return {}
  })
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <CrmSettings />
    </MemoryRouter>,
  )
const patches = () =>
  apiFetch.mock.calls
    .filter(([, opts]) => (opts as RequestInit | undefined)?.method === 'PATCH')
    .map(([, opts]) => JSON.parse(String((opts as RequestInit).body)) as Record<string, unknown>)
const block = async (name: RegExp) => within(await screen.findByRole('region', { name }))

describe('grille de chaleur : contrôles', () => {
  it('la grille de départ est cohérente et atteint 95 points', () => {
    expect(analysisIssues(DEFAULT_ANALYSIS)).toEqual([])
    expect(reachableTotal(DEFAULT_ANALYSIS.heatGrid.criteria)).toBe(95)
  })

  it('refuse clé en double, maximum nul, seuils non croissants et niveau inatteignable', () => {
    const grid = (patch: object) => ({ ...readAnalysis({}), heatGrid: { ...DEFAULT_ANALYSIS.heatGrid, ...patch } })
    const keys = (patch: object) => analysisIssues(grid(patch)).map((i) => i.key)
    const c = DEFAULT_ANALYSIS.heatGrid.criteria
    expect(keys({ criteria: [c[0], { ...c[1], key: c[0]!.key }] })).toContain('crmCallAi.an.err.dupKey')
    expect(keys({ criteria: [{ ...c[0], max: 0 }] })).toContain('crmCallAi.an.err.max')
    expect(keys({ thresholds: { tiede: 60, chaud: 50, tresChaud: 75 } })).toContain('crmCallAi.an.err.thresholds')
    expect(keys({ criteria: [{ ...c[0], max: 30 }] })).toContain('crmCallAi.an.err.unreachable')
    expect(keys({ criteria: [] })).toContain('crmCallAi.an.err.count')
  })

  it('une valeur absente des réglages retombe sur les défauts (modèle pas encore fusionné)', () => {
    expect(readRecording({}).keepAudioDays).toBe(0)
    expect(readRecording({}).notice.enabled).toBe(true)
  })
})

describe('réglages CRM — appels et IA', () => {
  it('dit si la téléphonie est configurée sur ce serveur', async () => {
    renderPage()
    expect(await screen.findByText('Téléphonie non configurée sur ce serveur')).toBeInTheDocument()
    expect(screen.getByText(/désactivés tant que l’opérateur n’est pas branché/)).toBeInTheDocument()
  })

  it('téléphonie : résume la plage et enregistre le bloc en entier', async () => {
    renderPage()
    const tel = await block(/^Téléphonie$/)
    expect(tel.getByText(/lun\., mar\., mer\., jeu\., ven\., de 09:00 à 20:00/)).toBeInTheDocument()
    fireEvent.click(tel.getByLabelText('sam.'))
    fireEvent.change(tel.getByLabelText(/^Tentatives par numéro et par jour/), { target: { value: '5' } })
    fireEvent.click(tel.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    const body = patches()[0]!
    expect(Object.keys(body)).toEqual(['telephony'])
    expect(body.telephony).toEqual({
      callingHours: { timezone: 'Europe/Paris', days: [1, 2, 3, 4, 5, 6], start: '09:00', end: '20:00' },
      attemptCapPerDay: 5,
      dialer: { voicemailDetection: true, previewDelaySec: 10, powerDelaySec: 3 },
    })
  })

  it('téléphonie : une plage inversée est refusée avant l’envoi', async () => {
    renderPage()
    const tel = await block(/^Téléphonie$/)
    fireEvent.change(tel.getByLabelText('Fin de la plage'), { target: { value: '08:00' } })
    expect(await tel.findByText('L’heure de fin doit être après l’heure de début.')).toBeInTheDocument()
    expect(tel.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    expect(patches()).toHaveLength(0)
  })

  it('enregistrement : rappelle que zéro veut dire « supprimé dès le transcript obtenu »', async () => {
    renderPage()
    const rec = await block(/^Enregistrement$/)
    expect(rec.getByText(/Zéro : l’audio est supprimé dès que le transcript est obtenu/)).toBeInTheDocument()
    fireEvent.change(rec.getByLabelText(/^Conservation de l’audio \(jours\)/), { target: { value: '30' } })
    expect(rec.getByText(/reste disponible 30 jour\(s\)/)).toBeInTheDocument()
    fireEvent.click(rec.getByLabelText('Annoncer l’enregistrement'))
    expect(rec.getByText(/Sans annonce, la personne appelée n’est pas prévenue/)).toBeInTheDocument()
    fireEvent.click(rec.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(patches()[0]!.callRecording).toMatchObject({ keepAudioDays: 30, notice: { enabled: false } })
  })

  it('analyse : une grille incohérente est refusée par l’écran, puis corrigée et envoyée entière', async () => {
    renderPage()
    const an = await block(/^Analyse$/)
    expect(an.getByText('Total atteignable : 95 points sur 100')).toBeInTheDocument()
    expect(an.getByText('Perte maximale : -20 points')).toBeInTheDocument()
    const save = an.getByRole('button', { name: 'Enregistrer' })

    fireEvent.change(an.getByLabelText('Tiède à partir de'), { target: { value: '90' } })
    expect(await an.findByText(/Les seuils doivent être des entiers croissants/)).toBeInTheDocument()
    expect(save).toBeDisabled()

    fireEvent.change(an.getByLabelText('Tiède à partir de'), { target: { value: '25' } })
    fireEvent.change(an.getByLabelText('Très chaud à partir de'), { target: { value: '100' } })
    expect(
      await an.findByText(/Le total atteignable \(95\) est inférieur au seuil « très chaud » \(100\)/),
    ).toBeInTheDocument()
    expect(save).toBeDisabled()
    expect(patches()).toHaveLength(0)

    fireEvent.change(an.getByLabelText('Très chaud à partir de'), { target: { value: '90' } })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)
    await waitFor(() => expect(patches()).toHaveLength(1))
    const body = patches()[0]!
    expect(Object.keys(body)).toEqual(['callAnalysis'])
    const saved = body.callAnalysis as {
      heatGrid: { criteria: unknown[]; thresholds: unknown }
      retentionMonths: number
    }
    expect(saved.heatGrid.criteria).toHaveLength(6)
    expect(saved.heatGrid.thresholds).toEqual({ tiede: 25, chaud: 50, tresChaud: 90 })
    expect(saved.retentionMonths).toBe(12)
  })

  it('analyse : retirer un critère, en ajouter un, rétablir la grille de départ', async () => {
    renderPage()
    const an = await block(/^Analyse$/)
    fireEvent.click(an.getByRole('button', { name: 'Supprimer le critère 6' }))
    expect(an.queryByText('Critère 6')).toBeNull()
    expect(an.getByText('Aucun critère ne retire de points.')).toBeInTheDocument()
  })

  it('analyse : le refus du serveur s’affiche à côté du bloc', async () => {
    refuse = 'callAnalysis.heatGrid : grille refusée'
    renderPage()
    const an = await block(/^Analyse$/)
    fireEvent.change(an.getByLabelText(/^Conservation des analyses \(mois\)/), { target: { value: '6' } })
    fireEvent.click(an.getByRole('button', { name: 'Enregistrer' }))
    expect(await an.findByText(/Enregistrement refusé : callAnalysis\.heatGrid : grille refusée/)).toBeInTheDocument()
  })

  it('MANAGER : lecture seule, aucun bouton d’enregistrement ni PATCH', async () => {
    auth.role = 'MANAGER'
    renderPage()
    const tel = await block(/^Téléphonie$/)
    expect(tel.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    expect(tel.getByLabelText('lun.')).toBeDisabled()
    fireEvent.click(tel.getByLabelText('lun.'))
    expect(patches()).toHaveLength(0)
  })
})
