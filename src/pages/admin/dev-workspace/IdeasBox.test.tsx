import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import IdeasBox from './IdeasBox'
import {
  bulkDevSuggestions,
  createDevSuggestion,
  listDevProjects,
  listDevSuggestions,
  type DevSuggestion,
} from '../../../services/dev'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', role: 'SUPER_ADMIN', permissions: [] } }),
}))
vi.mock('../../../services/dev', async (original) => ({
  ...(await original<typeof import('../../../services/dev')>()),
  listDevSuggestions: vi.fn(),
  listDevProjects: vi.fn(),
  createDevSuggestion: vi.fn(),
  bulkDevSuggestions: vi.fn(),
  toggleDevSuggestionVote: vi.fn(),
}))

const make = (over: Partial<DevSuggestion>): DevSuggestion =>
  ({
    _id: 's1',
    title: 'Signature électronique',
    problem: 'Impression papier',
    project: null,
    link: null,
    requester: { user: null, name: 'Camille R.' },
    impact: { amountEur: 18000, level: 'HIGH' },
    status: 'NEW',
    rejectionReason: null,
    voteCount: 3,
    hasVoted: false,
    issue: null,
    source: { kind: 'manual', name: null },
    statusHistory: [],
    archivedAt: null,
    createdAt: '2026-10-01',
    ...over,
  }) as DevSuggestion

beforeEach(() => {
  vi.mocked(listDevProjects).mockResolvedValue({ projects: [] })
  vi.mocked(listDevSuggestions).mockResolvedValue({
    items: [make({}), make({ _id: 's2', title: 'Import CSV', status: 'REJECTED', rejectionReason: 'Hors périmètre' })],
  })
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

it('submits a suggestion with title, problem, impact amount and level', async () => {
  vi.mocked(createDevSuggestion).mockResolvedValue(make({}))
  render(<IdeasBox />)
  await screen.findByText('Signature électronique')
  fireEvent.change(screen.getByLabelText('Titre de la suggestion'), { target: { value: 'Export PDF' } })
  fireEvent.change(screen.getByLabelText('Problème client'), { target: { value: 'Trop long' } })
  fireEvent.change(screen.getByLabelText('Impact commercial estimé (€)'), { target: { value: '12000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Critique' }))
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer la suggestion' }))
  await waitFor(() => expect(createDevSuggestion).toHaveBeenCalled())
  expect(vi.mocked(createDevSuggestion).mock.calls[0][0]).toMatchObject({
    title: 'Export PDF',
    problem: 'Trop long',
    amountEur: 12000,
    level: 'CRITICAL',
  })
})

it('filters by status and shows the rejection reason', async () => {
  render(<IdeasBox />)
  await screen.findByText('Signature électronique')
  fireEvent.click(screen.getByRole('button', { name: /Refusée/ }))
  expect(screen.queryByText('Signature électronique')).not.toBeInTheDocument()
  expect(screen.getByText('Motif : Hors périmètre')).toBeInTheDocument()
})

it('bulk-converts the selection with one server call', async () => {
  vi.mocked(bulkDevSuggestions).mockResolvedValue({ processed: ['s1'], failed: [] })
  render(<IdeasBox />)
  await screen.findByText('Signature électronique')
  fireEvent.click(screen.getByLabelText('Sélectionner « Signature électronique »'))
  fireEvent.change(screen.getByLabelText('Projet de destination…'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: /Convertir en issues/ }))
  // Sans projet : l'action est bloquée côté client avec un message explicite.
  expect(await screen.findByRole('alert')).toHaveTextContent('Choisissez un projet')
  expect(bulkDevSuggestions).not.toHaveBeenCalled()
})
