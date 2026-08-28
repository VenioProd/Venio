import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import WorklistView from '../pages/admin/crm-board/worklist/WorklistView'
import { DEFAULT_FOLLOW_UP } from '../pages/admin/crm-board/worklist/helpers'
import { getLeadAlerts, DEFAULT_WORKLIST_THRESHOLDS } from '../pages/admin/crm-board/constants'
import type { Lead, WorklistGroups } from '../types/crm.types'

function makeLead(overrides: Partial<Lead> & { _id: string }): Lead {
  return { company: `Société ${overrides._id}`, status: 'LEAD', ...overrides }
}

const emptyGroups: WorklistGroups = { overdue: [], today: [], upcoming: [], drifting: [] }

const handlers = {
  onPatch: vi.fn().mockResolvedValue(true),
  onLogContact: vi.fn().mockResolvedValue(true),
  onAddNote: vi.fn().mockResolvedValue(true),
  onOpenDetail: vi.fn(),
}

function renderView(groups: WorklistGroups, canManageCrm = true) {
  return render(
    <WorklistView
      groups={groups}
      thresholds={DEFAULT_WORKLIST_THRESHOLDS}
      followUp={DEFAULT_FOLLOW_UP}
      adminsById={{}}
      canManageCrm={canManageCrm}
      loading={false}
      busyLeadId={null}
      {...handlers}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WorklistView — rendu', () => {
  it('affiche chaque groupe non vide avec son compteur', () => {
    renderView({
      overdue: [makeLead({ _id: 'a', company: 'Acme', nextActionAt: '2026-08-01T09:00:00.000Z' })],
      today: [makeLead({ _id: 'b', company: 'Bravo' })],
      upcoming: [],
      drifting: [makeLead({ _id: 'c', company: 'Charlie' })],
    })

    const overdue = screen.getByRole('heading', { name: /En retard/ })
    expect(within(overdue).getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('Bravo')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
    // Le groupe « Cette semaine » est vide : il ne doit pas être rendu.
    expect(screen.queryByRole('heading', { name: /Cette semaine/ })).not.toBeInTheDocument()
  })

  it("affiche un état vide explicite quand rien n'attend", () => {
    renderView(emptyGroups)
    expect(screen.getByText('Rien ne vous attend')).toBeInTheDocument()
  })

  it('masque les actions à qui ne peut pas gérer le CRM', () => {
    renderView({ ...emptyGroups, today: [makeLead({ _id: 'a' })] }, false)
    expect(screen.queryByRole('button', { name: 'Reporter' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Contacté' })).not.toBeInTheDocument()
  })
})

describe('WorklistView — actions', () => {
  it('reporte une relance à demain', async () => {
    renderView({ ...emptyGroups, overdue: [makeLead({ _id: 'a', nextActionAt: '2026-08-01T09:00:00.000Z' })] })

    fireEvent.click(screen.getByRole('button', { name: 'Reporter' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Demain' }))

    await waitFor(() => expect(handlers.onPatch).toHaveBeenCalledTimes(1))
    const [leadId, patch] = handlers.onPatch.mock.calls[0]
    expect(leadId).toBe('a')

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const sent = new Date((patch as { nextActionAt: string }).nextActionAt)
    expect(sent.toDateString()).toBe(tomorrow.toDateString())
  })

  it('enregistre un contact avec sa note', async () => {
    renderView({ ...emptyGroups, today: [makeLead({ _id: 'a' })] })

    fireEvent.click(screen.getByRole('button', { name: 'Contacté' }))
    fireEvent.change(screen.getByPlaceholderText("Ce qui s'est dit…"), {
      target: { value: 'Rappelé, intéressé' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(handlers.onLogContact).toHaveBeenCalledTimes(1))
    const [leadId, payload] = handlers.onLogContact.mock.calls[0]
    expect(leadId).toBe('a')
    expect((payload as { note: string }).note).toBe('Rappelé, intéressé')
    expect((payload as { nextActionAt: string | null }).nextActionAt).toBeTruthy()
  })

  it('ajoute une note seule', async () => {
    renderView({ ...emptyGroups, drifting: [makeLead({ _id: 'a' })] })

    fireEvent.click(screen.getByRole('button', { name: 'Note' }))
    fireEvent.change(screen.getByPlaceholderText("Ce qui s'est dit…"), { target: { value: 'Relancé par mail' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() => expect(handlers.onAddNote).toHaveBeenCalledWith('a', 'Relancé par mail'))
  })

  it("garde le panneau ouvert et la saisie quand l'action échoue", async () => {
    handlers.onAddNote.mockResolvedValueOnce(false)
    renderView({ ...emptyGroups, today: [makeLead({ _id: 'a' })] })

    fireEvent.click(screen.getByRole('button', { name: 'Note' }))
    fireEvent.change(screen.getByPlaceholderText("Ce qui s'est dit…"), { target: { value: 'À ne pas perdre' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() => expect(handlers.onAddNote).toHaveBeenCalled())
    expect(screen.getByPlaceholderText("Ce qui s'est dit…")).toHaveValue('À ne pas perdre')
  })

  it('ouvre le détail depuis le nom du lead', () => {
    renderView({ ...emptyGroups, today: [makeLead({ _id: 'a', company: 'Acme' })] })
    fireEvent.click(screen.getByRole('button', { name: 'Acme' }))
    expect(handlers.onOpenDetail).toHaveBeenCalledTimes(1)
  })
})

describe('getLeadAlerts — seuils configurés', () => {
  const daysAgo = (days: number) => {
    const date = new Date()
    date.setDate(date.getDate() - days)
    return date.toISOString()
  }

  it('suit un seuil de froideur non standard', () => {
    const lead = makeLead({ _id: 'a', lastContactAt: daysAgo(4) })
    expect(getLeadAlerts(lead, DEFAULT_WORKLIST_THRESHOLDS)).toHaveLength(0)
    expect(getLeadAlerts(lead, { ...DEFAULT_WORKLIST_THRESHOLDS, coldDays: 3 })).toEqual([
      expect.objectContaining({ type: 'cold' }),
    ])
  })

  it("n'émet aucun badge quand l'alerte est désactivée", () => {
    const lead = makeLead({ _id: 'a', lastContactAt: daysAgo(40), statusChangedAt: daysAgo(40) })
    expect(
      getLeadAlerts(lead, { ...DEFAULT_WORKLIST_THRESHOLDS, coldEnabled: false, staleEnabled: false }),
    ).toHaveLength(0)
  })

  it('ignore les leads gagnés ou perdus', () => {
    const lead = makeLead({ _id: 'a', status: 'WON', lastContactAt: daysAgo(40) })
    expect(getLeadAlerts(lead, DEFAULT_WORKLIST_THRESHOLDS)).toHaveLength(0)
  })
})
