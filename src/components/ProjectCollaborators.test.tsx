import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import ProjectCollaborators from './ProjectCollaborators'

const viewer = {
  _id: 'member-1',
  role: 'VIEWER' as const,
  createdAt: '2026-07-13T12:00:00.000Z',
  user: { _id: 'user-1', name: 'Alice Martin', email: 'alice@example.test' },
}

describe('ProjectCollaborators', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('does not expose collaborator management or request it for a non-owner', () => {
    render(<ProjectCollaborators projectId="project-1" canManage={false} />)

    expect(screen.queryByText('Collaborateurs')).not.toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('adds by email, updates a role, and revokes after confirmation', async () => {
    const editor = {
      ...viewer,
      _id: 'member-2',
      role: 'EDITOR' as const,
      user: { _id: 'user-2', name: 'Bob Durand', email: 'bob@example.test' },
    }
    const updated = { ...viewer, role: 'EDITOR' as const }
    apiFetch
      .mockResolvedValueOnce({ collaborators: [viewer] })
      .mockResolvedValueOnce({ collaborator: editor })
      .mockResolvedValueOnce({ collaborator: updated })
      .mockResolvedValueOnce({ success: true })

    render(<ProjectCollaborators projectId="project-1" canManage />)

    await screen.findByText('Alice Martin')
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: 'bob@example.test' } })
    fireEvent.change(screen.getAllByLabelText('Rôle')[0], { target: { value: 'EDITOR' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/projects/project-1/collaborators', {
        method: 'POST',
        body: JSON.stringify({ email: 'bob@example.test', role: 'EDITOR' }),
      }),
    )
    expect(await screen.findByText('Bob Durand')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Rôle de Alice Martin'), { target: { value: 'EDITOR' } })
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/projects/project-1/collaborators/member-1', {
        method: 'PATCH',
        body: JSON.stringify({ role: 'EDITOR' }),
      }),
    )

    fireEvent.click(within(screen.getByText('Alice Martin').closest('li')!).getByRole('button', { name: 'Révoquer' }))
    expect(window.confirm).toHaveBeenCalledWith('Révoquer l’accès de Alice Martin ?')
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/projects/project-1/collaborators/member-1', { method: 'DELETE' }),
    )
    await waitFor(() => expect(screen.queryByText('Alice Martin')).not.toBeInTheDocument())
  })
})
