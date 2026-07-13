import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import RecommendationsPanel from './RecommendationsPanel'

const fetchDevProjectRecommendations = vi.fn()
const fetchDevAgentLaunchAvailability = vi.fn()
const launchDevAgentRun = vi.fn()

vi.mock('../../../services/dev', async () => {
  const actual = await vi.importActual<typeof import('../../../services/dev')>('../../../services/dev')
  return {
    ...actual,
    fetchDevProjectRecommendations: (...args: unknown[]) => fetchDevProjectRecommendations(...args),
    fetchDevAgentLaunchAvailability: (...args: unknown[]) => fetchDevAgentLaunchAvailability(...args),
    launchDevAgentRun: (...args: unknown[]) => launchDevAgentRun(...args),
  }
})

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'super-1', role: 'SUPER_ADMIN', name: 'Super admin' } }),
}))

describe('RecommendationsPanel', () => {
  it('exposes the source, freshness and limitation of each recommendation', async () => {
    fetchDevAgentLaunchAvailability.mockResolvedValue({
      available: false,
      reason: 'Bridge absent',
      target: null,
      limitations: [],
      scope: null,
    })
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
      counts: {
        total: 1,
        improve: 1,
        add: 0,
        optimize: 0,
        large_files: 0,
        bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
      },
      sections: {
        improve: [
          {
            id: 'issue-unowned-1',
            section: 'improve',
            title: 'REC-1 sans responsable',
            description: 'Attribuer un owner.',
            priority: 'high',
            source: 'issues',
            badges: ['sans owner'],
            metric: null,
            evidence: {
              source: 'Base des issues Dev (requête bornée à 400 issues)',
              observedAt: new Date().toISOString(),
              limitation: 'Les changements non enregistrés ne sont pas pris en compte.',
            },
            actions: [{ kind: 'open_issue', label: 'Attribuer un owner', issueId: 'issue-1' }],
          },
        ],
        add: [],
        optimize: [],
        large_files: [],
      },
    })

    render(<RecommendationsPanel projectId="project-1" onOpenIssue={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('REC-1 sans responsable')).toBeInTheDocument())
    expect(screen.getByText(/Source : Base des issues Dev/)).toBeInTheDocument()
    expect(screen.getByText(/Limite : Les changements non enregistrés/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attribuer un owner' })).toBeInTheDocument()
  })

  it('shows the framed launch confirmation only when the server makes it available', async () => {
    fetchDevAgentLaunchAvailability.mockResolvedValue({
      available: true,
      reason: null,
      target: { agent: 'madara', model: 'gpt-5.6-terra' },
      limitations: ['Aucun prompt système, commande shell ou credential transmis par le navigateur n’est accepté.'],
      scope: { repository: 'venio/cockpit', baseBranch: 'main' },
    })
    fetchDevProjectRecommendations.mockResolvedValue({
      projectId: 'project-1',
      generatedAt: new Date().toISOString(),
      nextRefreshAt: new Date(Date.now() + 60_000).toISOString(),
      ttlSeconds: 21_600,
      fromCache: false,
      cacheAgeSeconds: 0,
      status: 'ok',
      source: { issues: true, github: false, code: false },
      reasons: [],
      counts: {
        total: 1,
        improve: 1,
        add: 0,
        optimize: 0,
        large_files: 0,
        bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
      },
      sections: {
        improve: [
          {
            id: 'issue-stale-issue-1',
            section: 'improve',
            title: 'Réparer le cockpit',
            description: 'Issue liée.',
            priority: 'high',
            source: 'issues',
            badges: ['VEN-49'],
            metric: null,
            evidence: { source: 'Issues', observedAt: new Date().toISOString(), limitation: 'Limite.' },
            actions: [{ kind: 'open_issue', label: 'Voir l’issue', issueId: 'issue-1' }],
          },
        ],
        add: [],
        optimize: [],
        large_files: [],
      },
    })

    render(<RecommendationsPanel projectId="project-1" onOpenIssue={vi.fn()} />)
    const launch = await screen.findByRole('button', { name: /Lancer l’agent/ })
    fireEvent.click(launch)
    expect(screen.getByRole('dialog', { name: 'Confirmer la tâche agent' })).toBeInTheDocument()
    expect(screen.getByText(/madara · gpt-5.6-terra/)).toBeInTheDocument()
    expect(screen.getByText(/venio\/cockpit · branche main/)).toBeInTheDocument()
    expect(screen.getByText(/Aucun prompt système, commande shell/i)).toBeInTheDocument()
  })
})
