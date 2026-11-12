import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import CrmBoard from '../pages/admin/crm-board'
import { apiFetch } from '../lib/api'
import { DEFAULT_WORKLIST_THRESHOLDS } from '../pages/admin/crm-board/constants'
import { DEFAULT_FOLLOW_UP } from '../pages/admin/crm-board/worklist/helpers'

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'admin', role: 'SUPER_ADMIN', permissions: [] } }),
}))

const leads = [
  { _id: 'arrow', company: 'École migrée', project: 'ARROW', status: 'LEAD' },
  { _id: 'vigno', company: 'Domaine Vigno', project: 'VIGNO', status: 'LEAD' },
  { _id: 'legacy', company: 'Lead historique', project: '', status: 'LEAD' },
]

function Location() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="location">{location.search}</output>
      <button onClick={() => navigate('/admin/crm?project=VIGNO')}>Ouvrir Vigno</button>
    </>
  )
}

function renderBoard(query: string) {
  return render(
    <MemoryRouter initialEntries={[`/admin/crm${query}`]}>
      <CrmBoard />
      <Location />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path === '/api/admin/crm/pipeline') return { columns: [{ status: 'LEAD', leads }] }
    if (path === '/api/admin/admins') return { users: [] }
    if (path === '/api/admin/crm/worklist')
      return {
        groups: { overdue: leads, today: [], upcoming: [], drifting: [] },
        counts: { overdue: 3, today: 0, upcoming: 0, drifting: 0 },
        thresholds: DEFAULT_WORKLIST_THRESHOLDS,
        followUp: DEFAULT_FOLLOW_UP,
        lostReasons: [],
      }
    throw new Error(`Unexpected API request: ${path}`)
  })
})

describe('CRM principal — filtre Projet et anciennes écoles Arrow', () => {
  it('lit ?project=ARROW, conserve le filtre en Kanban et permet de l’effacer', async () => {
    renderBoard('?project=ARROW')
    expect(await screen.findByText('École migrée')).toBeInTheDocument()
    expect(screen.queryByText('Domaine Vigno')).not.toBeInTheDocument()
    expect(screen.queryByText('Lead historique')).not.toBeInTheDocument()
    expect(screen.queryByText(/Transférer vers Arrow/)).not.toBeInTheDocument()
    expect(vi.mocked(apiFetch).mock.calls.every(([path]) => !path.includes('arrow-prospection'))).toBe(true)

    fireEvent.click(screen.getByTitle('Vue Kanban'))
    expect(screen.getByText('École migrée')).toBeInTheDocument()
    expect(screen.queryByText('Domaine Vigno')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Projet' }), { target: { value: '' } })
    expect(screen.getByText('Domaine Vigno')).toBeInTheDocument()
    expect(screen.getByText('Lead historique')).toBeInTheDocument()
    // Le filtre Projet a quitté l'URL ; la vue active y reste.
    expect(screen.getByTestId('location')).toHaveTextContent('?mode=kanban')
  })

  it('filtre aussi la file, suit les changements d’URL et garde les autres paramètres', async () => {
    renderBoard('?project=ARROW&mode=file')
    expect(await screen.findByText('École migrée')).toBeInTheDocument()
    expect(screen.queryByText('Domaine Vigno')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Projet' }), { target: { value: 'VIGNO' } })
    expect(screen.getByText('Domaine Vigno')).toBeInTheDocument()
    expect(screen.queryByText('École migrée')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('project=VIGNO&mode=file')
    fireEvent.click(screen.getByTitle('Vue tableau'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('?project=VIGNO'))
  })

  it('suit un changement de projet dans l’URL après montage et ignore une valeur inconnue', async () => {
    renderBoard('?project=INCONNU')
    expect(await screen.findByText('École migrée')).toBeInTheDocument()
    expect(screen.getByText('Domaine Vigno')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Ouvrir Vigno'))
    await waitFor(() => expect(screen.queryByText('École migrée')).not.toBeInTheDocument())
    expect(screen.getByText('Domaine Vigno')).toBeInTheDocument()
  })
})
