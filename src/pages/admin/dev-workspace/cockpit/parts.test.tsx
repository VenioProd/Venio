import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TimelineRow } from './parts'

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
