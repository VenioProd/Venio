import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CrmToday from './index'
import CrmBoard from '../crm-board'
import { apiFetch } from '../../../lib/api'
import { DEFAULT_WORKLIST_THRESHOLDS } from '../crm-board/constants'
import { DEFAULT_FOLLOW_UP } from '../crm-board/worklist/helpers'
import type { Lead, WorklistGroupKey, WorklistGroups } from '../../../types/crm.types'

vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn() }))
const auth = vi.hoisted(() => ({ role: 'SUPER_ADMIN' }))
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'me', name: 'Raphael Bentvelzen', role: auth.role, permissions: [] } }),
}))

const daysFromNow = (days: number, hour = 9) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}
const lead = (id: string, extra: Partial<Lead> = {}): Lead => ({
  _id: id,
  company: `Société ${id}`,
  contactName: `Contact ${id}`,
  contactPhone: '+33612345678',
  status: 'CONTACTED',
  ...extra,
})

let groups: WorklistGroups
let pending: unknown
let lostReasons: string[]
const empty: WorklistGroups = { overdue: [], today: [], upcoming: [], drifting: [] }

beforeEach(() => {
  auth.role = 'SUPER_ADMIN'
  lostReasons = []
  groups = {
    overdue: [
      lead('morel', { company: 'Expert-comptable Morel', nextActionAt: daysFromNow(-2), priority: 'URGENTE' }),
      lead('lambert', { company: 'Garage Lambert', nextActionAt: daysFromNow(-1) }),
    ],
    today: [lead('osteo', { company: 'Cabinet Ostéo', nextActionAt: daysFromNow(0, 23) })],
    upcoming: [lead('sablon', { company: 'Brasserie du Sablon', nextActionAt: daysFromNow(2) })],
    drifting: [lead('immo', { company: 'Agence Immo', budget: 14000, nextActionLabel: 'Envoyer le devis' })],
  }
  pending = {
    analyses: [
      {
        callId: 'call-1',
        leadId: 'dubreuil',
        company: 'Menuiserie Dubreuil',
        callDate: '2026-11-13T09:07:00.000Z',
        durationSec: 262,
        author: { _id: 'me', name: 'Raphael' },
      },
      {
        callId: 'call-2',
        leadId: 'durand',
        company: 'Cabinet Durand',
        callDate: '2026-11-12T10:00:00.000Z',
        durationSec: 95,
        author: { _id: 'rita', name: 'Rita Externe' },
      },
    ],
    analysesTotal: 2,
    holds: [
      {
        leadId: 'horizon',
        company: 'Auto-école Horizon',
        at: '2026-11-12T16:48:00.000Z',
        author: { _id: 'bruno', name: 'Bruno Externe' },
      },
    ],
    holdsTotal: 1,
  }
  vi.mocked(apiFetch).mockReset()
  vi.mocked(apiFetch).mockImplementation(async (path: string, options?: RequestInit) => {
    if (path === '/api/admin/admins') return { users: [] }
    if (path === '/api/admin/crm/worklist')
      return {
        groups,
        counts: {
          overdue: groups.overdue.length,
          today: groups.today.length,
          upcoming: groups.upcoming.length,
          drifting: groups.drifting.length,
        },
        thresholds: DEFAULT_WORKLIST_THRESHOLDS,
        followUp: DEFAULT_FOLLOW_UP,
        lostReasons,
      }
    if (path === '/api/admin/call-desk/pending') return pending
    if (path === '/api/admin/call-desk/leads/horizon/call-hold' && !options?.method)
      return {
        hold: {
          at: '2026-11-12T16:48:00.000Z',
          quote: 'Arrêtez de m’appeler',
          quoteVerified: true,
          analysisErased: false,
          author: { _id: 'bruno', name: 'Bruno Externe' },
        },
      }
    if (path.startsWith('/api/admin/crm/leads/') && options?.method === 'PATCH') return { lead: {} }
    throw new Error(`Unexpected API request: ${path}`)
  })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

function Location() {
  const location = useLocation()
  return (
    <output aria-label="URL">
      {location.pathname}
      {location.search}
    </output>
  )
}
function mount(groupsShown: WorklistGroupKey[], path = '/admin/crm/aujourdhui', onCounts = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CrmToday worklistGroups={groupsShown} onWorklistCounts={onCounts} />
      <Location />
    </MemoryRouter>,
  )
}
const DAY: WorklistGroupKey[] = ['overdue', 'today']

describe('Aujourd’hui — accueil du jour', () => {
  it('salue, annonce ce qui attend et range retards, analyses, journée et retenues', async () => {
    const onCounts = vi.fn()
    mount(DAY, '/admin/crm/aujourdhui', onCounts)

    expect(await screen.findByRole('heading', { level: 1, name: 'Bonjour Raphael' })).toBeInTheDocument()
    // 2 en retard + 1 du jour + 2 analyses.
    expect(screen.getByText(/^5 éléments à traiter aujourd’hui\./)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '2 en retard, 1 du jour, 2 analyses à valider' })).toBeInTheDocument()
    expect(screen.getByText(/^Hors liste\s:\s1 cette semaine, 1 à ne pas laisser filer$/)).toBeInTheDocument()
    expect(onCounts).toHaveBeenCalledWith({ overdue: 2, today: 1, upcoming: 1, drifting: 1 })

    const late = screen.getByRole('region', { name: /En retard/ })
    expect(
      within(late)
        .getAllByRole('listitem')
        .map((row) => row.querySelector('a')?.textContent),
    ).toEqual(['Expert-comptable Morel', 'Garage Lambert'])
    expect(within(late).getByText('Priorité urgente')).toBeInTheDocument()
    expect(within(late).getByText(/^−2\sj$/)).toBeInTheDocument()
    const day = screen.getByRole('region', { name: /La journée/ })
    expect(within(day).getByText('Cabinet Ostéo')).toBeInTheDocument()
    expect(within(day).getByText(/maintenant$/)).toBeInTheDocument()

    // Analyses : la fiche s'ouvre sur l'appel concerné, depuis cet onglet.
    const analyses = screen.getByRole('region', { name: /Analyses d’appel à valider/ })
    expect(within(analyses).getByRole('link', { name: 'Menuiserie Dubreuil' })).toHaveAttribute(
      'href',
      '/admin/crm/leads/dubreuil?from=queue&analyse=call-1',
    )
    expect(within(analyses).getByText(/^Appel de 1\smin\s35, .* · par Rita Externe$/)).toBeInTheDocument()
    // Le bandeau met en avant l'analyse la plus récente.
    const now = screen.getByRole('region', { name: /Valider l’analyse de l’appel avec Menuiserie Dubreuil/ })
    expect(within(now).getByRole('link', { name: 'Ouvrir l’analyse' })).toHaveAttribute(
      'href',
      '/admin/crm/leads/dubreuil?from=queue&analyse=call-1',
    )

    // Retenue : la décision existante s'ouvre sur place et relit la citation.
    const holds = screen.getByRole('region', { name: /Oppositions à décider/ })
    expect(within(holds).getByText(/Retenue posée le .*, sur un appel de Bruno Externe/)).toBeInTheDocument()
    fireEvent.click(within(holds).getByRole('button', { name: 'Décider de la retenue sur Auto-école Horizon' }))
    expect(await within(holds).findByText('Arrêtez de m’appeler')).toBeInTheDocument()
    expect(within(holds).getByRole('button', { name: 'Confirmer l’opposition' })).toBeInTheDocument()
    expect(within(holds).getByRole('link', { name: 'Voir la fiche' })).toHaveAttribute(
      'href',
      '/admin/crm/leads/horizon?from=queue',
    )

    // Séance d'appels : vers le poste d'appel.
    expect(screen.getByRole('link', { name: 'Démarrer la séance d’appels' })).toHaveAttribute(
      'href',
      '/admin/crm/prospecter/poste',
    )
  })

  it('traiter puis suivant : la ligne reportée sort, le focus passe à la suivante et c’est annoncé', async () => {
    mount(DAY)
    await screen.findByText('Expert-comptable Morel')
    groups = { ...groups, overdue: groups.overdue.slice(1) }

    fireEvent.click(screen.getByRole('button', { name: 'Reporter la relance de Expert-comptable Morel' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Demain' }))

    await waitFor(() => expect(screen.queryByText('Expert-comptable Morel')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('link', { name: 'Garage Lambert' })).toHaveFocus())
    await waitFor(() =>
      expect(screen.getAllByRole('status').map((region) => region.textContent)).toContain(
        'Expert-comptable Morel traité. Ligne suivante : Garage Lambert.',
      ),
    )
    const patch = vi.mocked(apiFetch).mock.calls.find(([, options]) => options?.method === 'PATCH')
    expect(patch?.[0]).toBe('/api/admin/crm/leads/morel')
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ nextActionAt: expect.any(String) })
  })

  it('« Fait » consigne le contact comme avant : contact daté et relance reprogrammée', async () => {
    mount(DAY)
    await screen.findByText('Garage Lambert')
    fireEvent.click(screen.getByRole('button', { name: /^Fait.*Garage Lambert/ }))
    fireEvent.click(within(screen.getByRole('form', { name: 'Contact avec Garage Lambert' })).getByText('Enregistrer'))
    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        '/api/admin/crm/leads/lambert',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    )
    const body = JSON.parse(
      String(vi.mocked(apiFetch).mock.calls.find(([path]) => path === '/api/admin/crm/leads/lambert')?.[1]?.body),
    )
    expect(body).toEqual({ lastContactAt: expect.any(String), nextActionAt: expect.any(String) })
  })

  it('demande le motif avant de perdre une affaire, comme l’ancienne file', async () => {
    lostReasons = ['Prix']
    mount(DAY)
    await screen.findByText('Garage Lambert')
    fireEvent.change(screen.getByRole('combobox', { name: 'Statut de Garage Lambert' }), {
      target: { value: 'LOST' },
    })
    expect(await screen.findByText(/Garage Lambert/, { selector: 'h2' })).toBeInTheDocument()
    expect(vi.mocked(apiFetch).mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false)
  })

  it('le bouton d’appel ouvre la fiche prête à appeler, sans rien composer', async () => {
    mount(DAY)
    await screen.findByText('Garage Lambert')
    fireEvent.click(screen.getByRole('button', { name: /Appeler Garage Lambert/ }))
    expect(screen.getByLabelText('URL').textContent).toMatch(/^\/admin\/crm\/leads\/lambert\?.*from=queue/)
    expect(screen.getByLabelText('URL').textContent).toContain('appel=1')
  })

  it('sans gestion du CRM : ni actions, ni séance, ni lecture des décisions en attente', async () => {
    auth.role = 'STAGIAIRE'
    mount(DAY)
    await screen.findByText('Garage Lambert')
    expect(screen.queryByRole('button', { name: /^Fait/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Reporter/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Démarrer la séance d’appels' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Nouveau lead' })).toBeNull()
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalledWith('/api/admin/call-desk/pending')
    expect(screen.queryByRole('region', { name: /Oppositions/ })).toBeNull()
  })

  it('état vide : rien ne vous attend, avec la séance d’appels', async () => {
    groups = empty
    pending = { analyses: [], analysesTotal: 0, holds: [], holdsTotal: 0 }
    mount(DAY)
    expect(await screen.findByText('Rien ne vous attend')).toBeInTheDocument()
    expect(screen.getByText('Plus rien en retard')).toBeInTheDocument()
  })
})

describe('Cette semaine et À ne pas laisser filer', () => {
  it('liste la semaine avec les mêmes actions', async () => {
    mount(['upcoming'], '/admin/crm/aujourdhui/semaine')
    expect(await screen.findByRole('heading', { level: 1, name: 'Cette semaine' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Brasserie du Sablon' })).toHaveAttribute(
      'href',
      '/admin/crm/leads/sablon?from=semaine',
    )
    expect(screen.getByRole('button', { name: /^Reporter/ })).toBeInTheDocument()
    expect(screen.queryByText('Garage Lambert')).toBeNull()
  })

  it('montre le montant des fiches qui refroidissent, et un état vide filtré', async () => {
    const view = mount(['drifting'], '/admin/crm/aujourdhui/filer')
    expect(await screen.findByRole('heading', { level: 1, name: 'À ne pas laisser filer' })).toBeInTheDocument()
    expect(screen.getByText('Envoyer le devis')).toBeInTheDocument()
    expect(screen.getByText(/^14\s000\s€$/)).toBeInTheDocument()
    view.unmount()

    mount(['drifting'], '/admin/crm/aujourdhui/filer?project=ARROW')
    expect(await screen.findByText('Aucun lead ne refroidit')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retirer les filtres' }))
    expect(await screen.findByText('Agence Immo')).toBeInTheDocument()
  })
})

describe('Branchement', () => {
  it('la file de la coque monte cet écran ; le pipeline reste CrmBoard', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/crm/aujourdhui']}>
        <CrmBoard queue worklistGroups={['upcoming']} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Cette semaine' })).toBeInTheDocument()
    await act(async () => {})
  })
})
