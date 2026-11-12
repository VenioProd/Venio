import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CrmSequences from './index'
import SequenceBuilder from './SequenceBuilder'
import EnrollDialog from './EnrollDialog'
import LeadSequencesPanel from './LeadSequencesPanel'
import RichLeadTable from '../rich/RichLeadTable'
import { renderTemplate, validateDraft, emptyDraft } from './types'
import type { Lead } from '../../../../types/crm.types'

const apiFetch = vi.fn()
const auth = vi.hoisted(() => ({ role: 'ADMIN' }))
vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', name: 'Léa Durand', role: auth.role } }),
}))
vi.mock('../../../../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('../../../../lib/exportCsv', () => ({ exportToCsv: vi.fn() }))

const emailStep = {
  type: 'EMAIL',
  delayDays: 0,
  sendHourParis: 9,
  subject: 'Bonjour {contact}',
  body: 'Chez {company}',
  taskTitle: '',
}
const seq = (over: Record<string, unknown> = {}) => ({
  _id: 's1',
  name: 'Relance démo',
  description: 'Après une démo',
  entity: 'VENIO',
  status: 'DRAFT',
  steps: [emailStep, { type: 'WAIT', delayDays: 3, sendHourParis: 9, subject: '', body: '', taskTitle: '' }],
  stopOn: { reply: true, statusChange: true, statuses: ['WON', 'LOST'] },
  stats: { total: 8, active: 3, paused: 1, completed: 2, stopped: 2, stoppedByReason: { REPLY: 2 } },
  ...over,
})
const enrollment = (over: Record<string, unknown> = {}) => ({
  _id: 'e1',
  sequence: 's1',
  lead: { _id: 'l1', company: 'Atelier Lumière', contactName: 'Camille', status: 'CONTACTED' },
  currentStep: 1,
  status: 'ACTIVE',
  nextRunAt: '2026-11-10T09:00:00.000Z',
  stoppedReason: null,
  history: [{ step: 0, type: 'EMAIL', status: 'OK', message: 'Envoyé', at: '2026-11-09T09:00:00.000Z' }],
  ...over,
})

const calls = () =>
  apiFetch.mock.calls.map(([url, opts]) => ({
    url: String(url),
    method: (opts as RequestInit | undefined)?.method ?? 'GET',
    body: (opts as RequestInit | undefined)?.body as string | undefined,
  }))

let sequences: ReturnType<typeof seq>[]

beforeEach(() => {
  auth.role = 'ADMIN'
  sequences = [
    seq(),
    seq({
      _id: 's2',
      name: 'Nurturing actif',
      status: 'ACTIVE',
      stats: { total: 0, active: 0, paused: 0, completed: 0, stopped: 0, stoppedByReason: {} },
    }),
  ]
  apiFetch.mockReset()
  apiFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
    const method = opts?.method ?? 'GET'
    if (url === '/api/admin/crm/sequences' && method === 'GET') return { items: sequences, canAdminister: true }
    if (url === '/api/admin/crm/sequences' && method === 'POST')
      return seq({ _id: 's9', ...JSON.parse(String(opts?.body)) })
    if (/\/sequences\/s\d$/.test(url) && method === 'PATCH')
      return seq({ ...sequences.find((s) => url.endsWith(s._id)), ...JSON.parse(String(opts?.body)) })
    if (/\/sequences\/s\d\/enrollments/.test(url)) return { items: [enrollment()], page: 1, pageSize: 25, total: 1 }
    if (/\/sequences\/s\d\/unenroll$/.test(url)) return { sequenceId: 's1', stopped: ['l1'], notEnrolled: [] }
    if (/\/sequences\/s\d\/enroll$/.test(url)) {
      const sequenceStatus = url.includes('s2') ? 'ACTIVE' : 'DRAFT'
      return {
        sequenceId: 's1',
        sequenceStatus,
        enrolled: [{ leadId: 'a', enrollmentId: 'e9', nextRunAt: null }],
        refused: [
          { leadId: 'b', reason: 'DO_NOT_CONTACT' },
          { leadId: 'c', reason: 'ALREADY_ENROLLED' },
        ],
      }
    }
    if (url === '/api/admin/crm/leads/lead1/sequences')
      return {
        items: [
          enrollment({
            _id: 'e1',
            sequence: {
              _id: 's2',
              name: 'Nurturing actif',
              status: 'ACTIVE',
              steps: [emailStep, emailStep, emailStep],
            },
            currentStep: 1,
          }),
          enrollment({
            _id: 'e2',
            sequence: { _id: 's1', name: 'Relance démo', status: 'ACTIVE', steps: [emailStep, emailStep] },
            status: 'STOPPED',
            stoppedReason: 'REPLY',
            nextRunAt: null,
          }),
        ],
      }
    return { items: [] }
  })
})

describe('onglet Séquences', () => {
  it('affiche la liste avec statut, nombre d’étapes, statistiques et détail par raison d’arrêt', async () => {
    render(<CrmSequences />)
    const card = await screen.findByTestId('seq-s1')
    expect(within(card).getByText('Brouillon')).toBeInTheDocument()
    expect(card).toHaveTextContent('2 étape(s) · Venio')
    expect(within(card).getByText('8')).toBeInTheDocument()
    expect(within(card).getByText('Réponse du contact (2)')).toBeInTheDocument()
    expect(screen.getByTestId('seq-s2')).toHaveTextContent('Active')
    expect(screen.getByRole('button', { name: 'Nouvelle séquence' })).toBeInTheDocument()
  })

  it('lecture seule hors administrateur : aucun bouton d’édition', async () => {
    auth.role = 'COMMERCIAL'
    render(<CrmSequences />)
    expect(await screen.findByText('Relance démo')).toBeInTheDocument()
    expect(screen.getByText(/Lecture seule/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nouvelle séquence' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Activer la séquence/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Modifier la séquence/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Supprimer la séquence/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Ouvrir la séquence « Relance démo »/ })).toBeInTheDocument()
  })

  it('active une séquence puis la met en pause avec un PATCH status', async () => {
    render(<CrmSequences />)
    fireEvent.click(await screen.findByRole('button', { name: 'Activer la séquence « Relance démo »' }))
    await waitFor(() =>
      expect(calls()).toContainEqual(
        expect.objectContaining({
          url: '/api/admin/crm/sequences/s1',
          method: 'PATCH',
          body: JSON.stringify({ status: 'ACTIVE' }),
        }),
      ),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Mettre en pause la séquence « Relance démo »' }))
    await waitFor(() =>
      expect(calls()).toContainEqual(
        expect.objectContaining({
          url: '/api/admin/crm/sequences/s1',
          method: 'PATCH',
          body: JSON.stringify({ status: 'PAUSED' }),
        }),
      ),
    )
  })

  it('crée une séquence : POST avec les étapes saisies', async () => {
    render(<CrmSequences />)
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle séquence' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Ma séquence' } })
    fireEvent.change(within(dialog).getByLabelText('Objet (étape 1)'), { target: { value: 'Salut {contact}' } })
    fireEvent.change(within(dialog).getByLabelText('Texte de l’e-mail (étape 1)'), { target: { value: 'Message' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter une étape' }))
    fireEvent.change(within(dialog).getByLabelText('Type de l’étape 2'), { target: { value: 'TASK' } })
    fireEvent.change(within(dialog).getByLabelText('Titre de la tâche (étape 2)'), { target: { value: 'Appeler' } })
    fireEvent.change(within(dialog).getByLabelText('Délai en jours (étape 2)'), { target: { value: '4' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(calls().some((c) => c.method === 'POST')).toBe(true))
    const post = calls().find((c) => c.method === 'POST')!
    const body = JSON.parse(post.body!)
    expect(post.url).toBe('/api/admin/crm/sequences')
    expect(body.name).toBe('Ma séquence')
    expect(body.steps).toHaveLength(2)
    expect(body.steps[0]).toMatchObject({
      type: 'EMAIL',
      subject: 'Salut {contact}',
      body: 'Message',
      delayDays: 0,
      sendHourParis: 9,
    })
    expect(body.steps[1]).toMatchObject({ type: 'TASK', taskTitle: 'Appeler', delayDays: 4 })
    expect(body.stopOn).toEqual({ reply: true, statusChange: true, statuses: ['WON', 'LOST'] })
    expect(body.entity).toBeNull()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('refuse l’enregistrement sans objet pour un e-mail', async () => {
    render(<CrmSequences />)
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle séquence' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'X' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('L’étape 1 (e-mail) a besoin d’un objet.')
    expect(calls().some((c) => c.method === 'POST')).toBe(false)
  })

  it('détail : liste les inscriptions, filtre par état et désinscrit un lead', async () => {
    render(<CrmSequences />)
    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir la séquence « Relance démo »/ }))
    const row = await screen.findByTestId('enr-e1')
    expect(row).toHaveTextContent('Atelier Lumière')
    expect(row).toHaveTextContent('Étape 2/2')
    fireEvent.click(screen.getByRole('button', { name: 'Arrêtée' }))
    await waitFor(() => expect(calls().some((c) => c.url.includes('status=STOPPED'))).toBe(true))
    fireEvent.click(await screen.findByRole('button', { name: 'Désinscrire Atelier Lumière' }))
    await waitFor(() =>
      expect(calls()).toContainEqual(
        expect.objectContaining({
          url: '/api/admin/crm/sequences/s1/unenroll',
          method: 'POST',
          body: JSON.stringify({ leadIds: ['l1'] }),
        }),
      ),
    )
  })
})

describe('constructeur — variables et aperçu', () => {
  it('rend l’aperçu avec des valeurs d’exemple et insère une variable cliquée', () => {
    render(<SequenceBuilder sequence={seq() as never} onClose={vi.fn()} onSaved={vi.fn()} />)
    const preview = screen.getByTestId('preview-0')
    expect(preview).toHaveTextContent('Bonjour Camille Martin')
    expect(preview).toHaveTextContent('Chez Atelier Lumière')
    const subject = screen.getByLabelText('Objet (étape 1)') as HTMLInputElement
    fireEvent.focus(subject)
    subject.setSelectionRange(subject.value.length, subject.value.length)
    fireEvent.click(screen.getByRole('button', { name: 'Insérer la variable {owner}' }))
    expect(subject.value).toBe('Bonjour {contact}{owner}')
    expect(screen.getByTestId('preview-0')).toHaveTextContent('Bonjour Camille MartinLéa Durand')
    expect(screen.getByText(/lien de désinscription est ajouté automatiquement/)).toBeInTheDocument()
  })

  it('réordonne les étapes et le dialogue est accessible', () => {
    render(<SequenceBuilder sequence={seq() as never} onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Modifier la séquence')
    fireEvent.click(screen.getByRole('button', { name: 'Descendre l’étape 1' }))
    expect((screen.getByLabelText('Type de l’étape 1') as HTMLSelectElement).value).toBe('WAIT')
    expect((screen.getByLabelText('Type de l’étape 2') as HTMLSelectElement).value).toBe('EMAIL')
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer l’étape 1' }))
    expect(screen.queryByLabelText('Type de l’étape 2')).toBeNull()
  })

  it('helpers : rendu des modèles et validation', () => {
    const sample = { contact: 'A', company: 'B', owner: 'C', amount: 'D' }
    expect(renderTemplate('{contact}/{company}/{owner}/{amount}/{x}', sample)).toBe('A/B/C/D/{x}')
    expect(validateDraft(emptyDraft())?.key).toBe('crmSeq.builder.needName')
  })
})

describe('<EnrollDialog />', () => {
  it('affiche les inscrits et les refus avec leur libellé, et prévient si la séquence n’est pas active', async () => {
    const onEnrolled = vi.fn()
    render(
      <EnrollDialog
        leadIds={['a', 'b', 'c']}
        leadLabels={{ b: 'Brasserie Quai 9' }}
        onClose={vi.fn()}
        onEnrolled={onEnrolled}
      />,
    )
    const select = await screen.findByLabelText('Séquence')
    fireEvent.change(select, { target: { value: 's1' } })
    expect(screen.getByText(/rien ne partira tant qu’elle n’est pas activée/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Inscrire' }))
    const summary = await screen.findByTestId('enroll-summary')
    expect(summary).toHaveTextContent('1 inscrit(s), 2 refusé(s).')
    expect(summary).toHaveTextContent('Brasserie Quai 9 — Marqué « ne pas contacter »')
    expect(summary).toHaveTextContent('Lead c — Déjà inscrit à cette séquence')
    expect(onEnrolled).toHaveBeenCalled()
    expect(calls()).toContainEqual(
      expect.objectContaining({
        url: '/api/admin/crm/sequences/s1/enroll',
        method: 'POST',
        body: JSON.stringify({ leadIds: ['a', 'b', 'c'] }),
      }),
    )
  })
})

describe('<LeadSequencesPanel />', () => {
  it('liste les séquences du lead (étape x/n, prochaine exécution, raison d’arrêt) et désinscrit', async () => {
    render(<LeadSequencesPanel leadId="lead1" canManageCrm />)
    const active = await screen.findByTestId('lead-enr-e1')
    expect(active).toHaveTextContent('Nurturing actif')
    expect(active).toHaveTextContent('Étape 2/3')
    expect(active).toHaveTextContent('Prochaine exécution')
    expect(screen.getByTestId('lead-enr-e2')).toHaveTextContent('Motif : Réponse du contact')
    // l’inscription arrêtée n’a pas de bouton « Désinscrire »
    expect(within(screen.getByTestId('lead-enr-e2')).queryByRole('button')).toBeNull()
    fireEvent.click(within(active).getByRole('button', { name: 'Désinscrire de « Nurturing actif »' }))
    await waitFor(() =>
      expect(calls()).toContainEqual(
        expect.objectContaining({
          url: '/api/admin/crm/sequences/s2/unenroll',
          method: 'POST',
          body: JSON.stringify({ leadIds: ['lead1'] }),
        }),
      ),
    )
  })

  it('inscrit le lead via le dialogue', async () => {
    render(<LeadSequencesPanel leadId="lead1" canManageCrm />)
    fireEvent.click(await screen.findByRole('button', { name: 'Inscrire à une séquence' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(await within(dialog).findByLabelText('Séquence'), { target: { value: 's2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Inscrire' }))
    await waitFor(() =>
      expect(calls()).toContainEqual(
        expect.objectContaining({
          url: '/api/admin/crm/sequences/s2/enroll',
          method: 'POST',
          body: JSON.stringify({ leadIds: ['lead1'] }),
        }),
      ),
    )
  })

  it('sans manage_crm : lecture seule', async () => {
    render(<LeadSequencesPanel leadId="lead1" canManageCrm={false} />)
    expect(await screen.findByTestId('lead-enr-e1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Inscrire à une séquence' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Désinscrire/ })).toBeNull()
  })
})

describe('action groupée du board', () => {
  const leads: Lead[] = [
    { _id: 'a', company: 'Atelier Pivoine', status: 'PROPOSAL', budget: 10000 },
    { _id: 'b', company: 'Brasserie Quai 9', status: 'LEAD', budget: 6000 },
  ]
  const setup = (canManageCrm = true) =>
    render(
      <MemoryRouter>
        <RichLeadTable
          project=""
          onProjectChange={vi.fn()}
          leads={leads}
          admins={[]}
          adminsById={{}}
          canManageCrm={canManageCrm}
          onOpenLead={vi.fn()}
          onReload={vi.fn().mockResolvedValue(undefined)}
          onError={vi.fn()}
        />
      </MemoryRouter>,
    )

  it('« Ajouter à une séquence » apparaît sur la sélection et ouvre le dialogue d’inscription', async () => {
    localStorage.clear()
    setup()
    expect(screen.queryByRole('button', { name: 'Ajouter à une séquence' })).toBeNull()
    fireEvent.click(screen.getByLabelText('Sélectionner Atelier Pivoine'))
    fireEvent.click(screen.getByLabelText('Sélectionner Brasserie Quai 9'))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter à une séquence' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('2 lead(s) sélectionné(s).')
  })

  it('absente sans manage_crm', () => {
    localStorage.clear()
    setup(false)
    expect(screen.queryByLabelText('Sélectionner Atelier Pivoine')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ajouter à une séquence' })).toBeNull()
  })
})
