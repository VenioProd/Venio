import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DeploymentPanel, RepoQualityPanel, TimelineRow } from './parts'

describe('TimelineRow', () => {
  it('renders persisted GitHub metadata and opens its linked issue', () => {
    const onOpen = vi.fn()
    render(
      <TimelineRow
        onOpen={onOpen}
        event={{
          _id: 'event-1',
          type: 'github_linked',
          category: 'github',
          at: '2026-07-13T10:00:00.000Z',
          summary: 'VENIO-49 lien GitHub mis à jour',
          metadata: {
            github: {
              prUrl: 'https://github.com/venio/app/pull/49',
              commitSha: 'abcdef1234567890',
            },
          },
          commentBody: null,
          actor: { _id: 'user-1', name: 'Madara', email: 'madara@venio.paris' },
          issue: { _id: 'issue-49', identifier: 'VENIO-49', title: 'Timeline projet', status: 'IN_PROGRESS' },
        }}
      />,
    )

    expect(screen.getByText('Lien GitHub')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /PR/i })).toHaveAttribute('href', 'https://github.com/venio/app/pull/49')
    expect(screen.getByText('abcdef123456')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /VENIO-49/i }))
    expect(onOpen).toHaveBeenCalledWith('issue-49')
  })

  it('shows the stored comment body', () => {
    render(
      <TimelineRow
        onOpen={vi.fn()}
        event={{
          _id: 'comment-1',
          type: 'commented',
          category: 'comment',
          at: '2026-07-13T10:00:00.000Z',
          summary: 'Commentaire ajouté',
          metadata: { commentId: 'comment-1' },
          commentBody: 'La CI est verte après le correctif.',
          actor: null,
          issue: null,
        }}
      />,
    )

    expect(screen.getByText('La CI est verte après le correctif.')).toBeInTheDocument()
  })
})

describe('RepoQualityPanel', () => {
  it('shows the observed denominator, sources and unavailable signals without inventing a score', () => {
    render(
      <RepoQualityPanel
        quality={{
          score: 72,
          scoredPoints: 36,
          scoredOutOf: 50,
          formula: 'Score = somme des points observés / somme des maxima observés × 100.',
          signals: [
            {
              id: 'large_files',
              label: 'Fichiers trop gros',
              status: 'warn',
              points: 12,
              maxPoints: 25,
              value: '2 fichier(s) au-dessus des seuils par langage',
              action: 'Découper les fichiers.',
              source: 'scan filesystem',
              checkedAt: '2026-07-13T10:00:00.000Z',
            },
            {
              id: 'coverage',
              label: 'Tests / coverage',
              status: 'unavailable',
              points: null,
              maxPoints: 20,
              value: 'Aucun artefact coverage-summary.json valide.',
              action: null,
              source: 'coverage/coverage-summary.json',
              checkedAt: null,
            },
          ],
        }}
      />,
    )

    expect(screen.getByText('72/100')).toBeInTheDocument()
    expect(screen.getByText(/score sur 50 pts observés/i)).toBeInTheDocument()
    expect(screen.getByText('Aucun artefact coverage-summary.json valide.')).toBeInTheDocument()
    expect(screen.getByText('coverage/coverage-summary.json')).toBeInTheDocument()
  })
})

describe('DeploymentPanel', () => {
  it('renders the persisted production observations and only the server-provided GitHub links', () => {
    render(
      <DeploymentPanel
        deployment={{
          configured: true,
          reason: null,
          productionCommit: {
            sha: 'abcdef1234567890',
            observedAt: '2026-07-13T10:00:00.000Z',
            source: 'timeline_deployment',
            url: 'https://github.com/venio/app/commit/abcdef1234567890',
          },
          ci: {
            status: 'FAILURE',
            observedAt: '2026-07-13T10:00:00.000Z',
            source: 'timeline_ci',
            runUrl: 'https://github.com/venio/app/actions/runs/49',
          },
          deployment: {
            status: 'success',
            observedAt: '2026-07-13T10:00:00.000Z',
            source: 'timeline_deployment',
            logsUrl: 'https://github.com/venio/app/actions/runs/48',
          },
          healthcheck: {
            status: 'healthy',
            observedAt: '2026-07-13T10:00:00.000Z',
            source: 'timeline_deployment',
          },
          observedAt: '2026-07-13T10:00:00.000Z',
          freshness: 'fresh',
          freshnessThresholdHours: 24,
        }}
      />,
    )

    expect(screen.getByText('Commit en production')).toBeInTheDocument()
    expect(screen.getByText('abcdef123456')).toBeInTheDocument()
    expect(screen.getByText('Échec')).toBeInTheDocument()
    expect(screen.getByText('Réussi')).toBeInTheDocument()
    expect(screen.getByText('Sain')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /run/i })).toHaveAttribute(
      'href',
      'https://github.com/venio/app/actions/runs/49',
    )
  })

  it('keeps missing deployment and healthcheck evidence explicitly unknown', () => {
    render(
      <DeploymentPanel
        deployment={{
          configured: false,
          reason: 'GitHub owner/repo non configuré.',
          productionCommit: { sha: null, observedAt: null, source: 'unavailable', url: null },
          ci: { status: null, observedAt: null, source: 'unavailable', runUrl: null },
          deployment: { status: 'unknown', observedAt: null, source: 'unavailable', logsUrl: null },
          healthcheck: { status: 'unknown', observedAt: null, source: 'unavailable' },
          observedAt: null,
          freshness: 'unknown',
          freshnessThresholdHours: 24,
        }}
      />,
    )

    expect(screen.getAllByText('Inconnu')).toHaveLength(4)
    expect(screen.getByText(/aucune sonde externe/i)).toBeInTheDocument()
  })
})
