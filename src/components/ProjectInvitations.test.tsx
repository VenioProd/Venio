import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import ProjectInvitations from './ProjectInvitations'

const activeInvitation = {
  _id: 'invitation-1',
  role: 'VIEWER' as const,
  createdAt: '2026-07-13T12:00:00.000Z',
  expiresAt: '2030-07-20T12:00:00.000Z',
  revokedAt: null,
  usedAt: null,
  usedBy: null,
}

describe('ProjectInvitations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('does not render or request invitations for a non-owner', () => {
    render(<ProjectInvitations projectId="project-1" canManage={false} />)

    expect(screen.queryByText('Liens d’invitation')).not.toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('generates, copies, lists metadata, and revokes an active invitation', async () => {
    const generated = { ...activeInvitation, _id: 'invitation-2', role: 'EDITOR' as const }
    const revoked = { ...generated, revokedAt: '2026-07-13T13:00:00.000Z' }
    apiFetch
      .mockResolvedValueOnce({ invitations: [activeInvitation] })
      .mockResolvedValueOnce({
        invitation: generated,
        invitationUrl: 'https://app.example.test/espace-client/invitation#secret',
      })
      .mockResolvedValueOnce({ invitation: revoked })

    render(<ProjectInvitations projectId="project-1" canManage />)

    // Wait for the initial GET to finish rendering the list (loading -> false) before
    // interacting. The seeded invitation is an active VIEWER, so its "Révoquer" button
    // only exists once the list is rendered — unlike the "Lecteur" role <option>, which is
    // present from the first render and would let the test race ahead of the load.
    await screen.findByRole('button', { name: 'Révoquer' })
    fireEvent.change(screen.getByLabelText('Rôle accordé'), { target: { value: 'EDITOR' } })
    fireEvent.click(screen.getByRole('button', { name: 'Générer un lien' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/projects/project-1/invitations', {
        method: 'POST',
        body: JSON.stringify({ role: 'EDITOR' }),
      }),
    )
    expect(
      await screen.findByDisplayValue('https://app.example.test/espace-client/invitation#secret'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copier le lien' }))
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://app.example.test/espace-client/invitation#secret',
      ),
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Révoquer' })[0]!)
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/projects/project-1/invitations/invitation-2', { method: 'DELETE' }),
    )
    expect(await screen.findByText('Révoquée')).toBeInTheDocument()
  })
})
