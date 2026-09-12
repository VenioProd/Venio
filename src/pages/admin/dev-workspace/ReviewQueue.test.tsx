import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ReviewQueue } from './ReviewQueue'
import { getDevIssue, listDevIssues, updateDevIssue, type DevIssue } from '../../../services/dev'
vi.mock('../../../services/dev', async (original) => ({
  ...(await original<typeof import('../../../services/dev')>()),
  getDevIssue: vi.fn(),
  listDevIssues: vi.fn(),
  updateDevIssue: vi.fn(),
}))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
const issue = {
  _id: 'i1',
  title: 'Recette',
  status: 'IN_REVIEW',
  type: 'TASK',
  priority: 'HIGH',
  updatedAt: '2026-09-12',
  acceptanceCriteria: ['[x] Test réussi'],
  project: 'p1',
} as DevIssue
it('requires fresh completed criteria before approval and does not approve a concurrently changed issue', async () => {
  vi.mocked(listDevIssues).mockResolvedValue({ issues: [issue], total: 1 })
  vi.mocked(getDevIssue)
    .mockResolvedValueOnce({ issue, comments: [], events: [] })
    .mockResolvedValue({ issue: { ...issue, acceptanceCriteria: ['Nouveau critère'] }, comments: [], events: [] })
  render(<ReviewQueue projects={[]} canManage onChanged={() => {}} onClose={() => {}} />)
  await screen.findByLabelText('Test réussi')
  fireEvent.click(screen.getByRole('button', { name: 'Approuver (a)' }))
  await screen.findByText('Des critères restent à vérifier.')
  expect(updateDevIssue).not.toHaveBeenCalled()
})
it('can retry a failed detail request for the same active issue', async () => {
  vi.mocked(listDevIssues).mockResolvedValue({ issues: [issue], total: 1 })
  vi.mocked(getDevIssue)
    .mockRejectedValueOnce(new Error('Détail indisponible'))
    .mockResolvedValue({ issue, comments: [], events: [] })
  render(<ReviewQueue projects={[]} canManage onChanged={() => {}} onClose={() => {}} />)
  await screen.findByText('Détail indisponible')
  expect(screen.getByRole('button', { name: 'Approuver (a)' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Approuver (a)' })).toBeEnabled())
  expect(getDevIssue).toHaveBeenCalledTimes(2)
})
