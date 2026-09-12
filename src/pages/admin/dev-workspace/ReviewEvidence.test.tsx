import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReviewEvidence, productionEvidence } from './ReviewEvidence'
import { addDevIssueComment, updateDevIssue, type DevIssue, type DevIssueEvent } from '../../../services/dev'
vi.mock('../../../services/dev', async (original) => ({
  ...(await original<typeof import('../../../services/dev')>()),
  addDevIssueComment: vi.fn(),
  updateDevIssue: vi.fn(),
}))
const sha = 'a'.repeat(40)
const issue = {
  _id: 'i1',
  status: 'IN_REVIEW',
  acceptanceCriteria: ['Le formulaire se sauvegarde', '[x] CI verte'],
  github: { commitSha: sha, mergedAt: '2026-09-12T10:00:00Z' },
  executionProfile: { verificationPlan: 'Tester fermeture rapide et erreur réseau.' },
} as DevIssue
const event = (metadata: Record<string, unknown>, createdAt = '2026-09-12T10:00:00Z') =>
  ({ type: 'deployed', metadata, createdAt }) as DevIssueEvent
afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())
it('does not infer production from merge or staging and reports only matching observed evidence', () => {
  expect(productionEvidence(issue, [])).toBe('Non confirmée')
  expect(productionEvidence(issue, [event({ environment: 'staging', status: 'success', commitSha: sha })])).toBe(
    'Non confirmée',
  )
  expect(
    productionEvidence(issue, [
      event({ environment: 'prod', status: 'success', commitSha: 'b'.repeat(40), healthcheck: { status: 'healthy' } }),
    ]),
  ).toContain('version à vérifier')
  expect(
    productionEvidence(issue, [
      event({ environment: 'prod', status: 'success', github: { commitSha: sha }, healthcheck: { status: 'healthy' } }),
    ]),
  ).toContain('Disponibilité vérifiée le')
  expect(
    productionEvidence(issue, [
      event({ environment: 'prod', status: 'failed' }, '2026-09-12T12:00:00Z'),
      event({ environment: 'prod', status: 'success', commitSha: sha }),
    ]),
  ).toContain('échec')
})
it('persists checked criteria and evidence while leaving delivery states distinct', async () => {
  const onUpdated = vi.fn(),
    onEvidence = vi.fn()
  vi.mocked(updateDevIssue).mockResolvedValue(issue)
  vi.mocked(addDevIssueComment).mockResolvedValue({ _id: 'e1', body: 'Tests validés', kind: 'EVIDENCE' } as never)
  render(
    <ReviewEvidence
      issue={issue}
      comments={[]}
      events={[]}
      canManage
      onUpdated={onUpdated}
      onEvidence={onEvidence}
      onBusy={() => {}}
    />,
  )
  fireEvent.click(screen.getByLabelText('Le formulaire se sauvegarde'))
  await waitFor(() => expect(onUpdated).toHaveBeenCalled())
  expect(updateDevIssue).toHaveBeenCalledWith('i1', {
    acceptanceCriteria: ['[x] Le formulaire se sauvegarde', '[x] CI verte'],
  })
  fireEvent.change(screen.getByLabelText('Nouvelle preuve'), { target: { value: 'Tests validés' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la preuve' }))
  await waitFor(() => expect(onEvidence).toHaveBeenCalled())
  expect(addDevIssueComment).toHaveBeenCalledWith('i1', { body: 'Tests validés', kind: 'EVIDENCE' })
  expect(screen.getByText('Non confirmée')).toBeInTheDocument()
})
it('keeps review evidence readable without granting mutation permission', () => {
  render(
    <ReviewEvidence
      issue={issue}
      comments={[]}
      events={[]}
      onUpdated={() => {}}
      onEvidence={() => {}}
      onBusy={() => {}}
    />,
  )
  expect(screen.getByLabelText('Le formulaire se sauvegarde')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Enregistrer la preuve' })).toBeDisabled()
})
