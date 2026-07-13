import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import RecommendationsPanel from './RecommendationsPanel'

const fetchDevProjectRecommendations = vi.fn()

vi.mock('../../../services/dev', async () => {
  const actual = await vi.importActual<typeof import('../../../services/dev')>('../../../services/dev')
  return { ...actual, fetchDevProjectRecommendations: (...args: unknown[]) => fetchDevProjectRecommendations(...args) }
})

describe('RecommendationsPanel', () => {
  it('exposes the source, freshness and limitation of each recommendation', async () => {
    fetchDevProjectRecommendations.mockResolvedValue({
      projectId: 'project-1',
      generatedAt: new Date().toISOString(),
      nextRefreshAt: new Date(Date.now() + 60_000).toISOString(),
      ttlSeconds: 21_600,
      fromCache: true,
      cacheAgeSeconds: 4,
      status: 'ok',
      source: { issues: true, github: true, code: true },
      reasons: [],
      counts: { total: 1, improve: 1, add: 0, optimize: 0, large_files: 0, bySeverity: { critical: 0, high: 1, medium: 0, low: 0 } },
      sections: {
        improve: [{
          id: 'issue-unowned-1', section: 'improve', title: 'REC-1 sans responsable',
          description: 'Attribuer un owner.', priority: 'high', source: 'issues', badges: ['sans owner'], metric: null,
          evidence: {
            source: 'Base des issues Dev (requête bornée à 400 issues)',
            observedAt: new Date().toISOString(),
            limitation: 'Les changements non enregistrés ne sont pas pris en compte.',
          },
          actions: [{ kind: 'open_issue', label: 'Attribuer un owner', issueId: 'issue-1' }],
        }],
        add: [], optimize: [], large_files: [],
      },
    })

    render(<RecommendationsPanel projectId="project-1" onOpenIssue={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('REC-1 sans responsable')).toBeInTheDocument())
    expect(screen.getByText(/Source : Base des issues Dev/)).toBeInTheDocument()
    expect(screen.getByText(/Limite : Les changements non enregistrés/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attribuer un owner' })).toBeInTheDocument()
  })
})
