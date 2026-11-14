import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import CrmHub from './CrmHub'
import { apiFetch } from '../../../lib/api'
import type { WorklistResponse } from '../../../types/crm.types'

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'me', name: 'Raphael', role: 'SUPER_ADMIN', permissions: [] }, loading: false }),
}))
vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../crm-board/automations/api', () => ({ fetchRuns: vi.fn().mockResolvedValue({ total: 0 }) }))
// L'écran « Aujourd'hui » remonte ses compteurs et le nombre d'analyses par `onWorklistCounts`.
vi.mock('../CrmBoard', () => ({
  default: ({
    onWorklistCounts,
  }: {
    onWorklistCounts?: (counts: WorklistResponse['counts'], analyses?: number) => void
  }) => (
    <button type="button" onClick={() => onWorklistCounts?.({ overdue: 2, today: 3, upcoming: 0, drifting: 0 }, 1)}>
      Analyse validée
    </button>
  ),
}))

beforeEach(() => {
  vi.mocked(apiFetch).mockReset()
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    if (path === '/api/admin/crm/worklist') return { counts: { overdue: 2, today: 3, upcoming: 4, drifting: 0 } }
    if (path === '/api/admin/call-desk/pending') return { analysesTotal: 2 }
    return {}
  })
})

it('compte dans « Aujourd’hui » les analyses à valider, comme l’écran', async () => {
  render(
    <MemoryRouter initialEntries={['/admin/crm/aujourdhui']}>
      <CrmHub />
    </MemoryRouter>,
  )
  // 2 en retard + 3 du jour + 2 analyses, dans le moment et dans son sous-onglet.
  expect(await screen.findByText('7 à traiter')).toHaveClass('crm-ui-moment__hint')
  expect(screen.getByRole('link', { name: 'Aujourd’hui 7' })).toBeInTheDocument()
  // Une analyse validée depuis l'écran : le compteur suit.
  fireEvent.click(await screen.findByRole('button', { name: 'Analyse validée' }))
  expect(await screen.findByText('6 à traiter')).toBeInTheDocument()
})
