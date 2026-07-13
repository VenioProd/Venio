import { render, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
let authState: { user: { role: string } | null; loading: boolean }

vi.mock('../../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState }))

import ProjectInvitationAccept from './ProjectInvitationAccept'

const token = 'a'.repeat(43)

describe('ProjectInvitationAccept', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    window.history.replaceState({}, '', '/')
    authState = { user: { role: 'CLIENT' }, loading: false }
  })

  it('removes the fragment, accepts only after client authentication, and clears temporary storage', async () => {
    window.history.replaceState({}, '', `/espace-client/invitation#${token}`)
    apiFetch.mockResolvedValue({ projectId: 'project-1' })

    render(<ProjectInvitationAccept />, { wrapper: BrowserRouter })

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/projects/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
    )
    expect(window.location.hash).toBe('')
    expect(sessionStorage.getItem('venio-project-invitation-token')).toBeNull()
  })

  it('preserves the return flow without putting the secret in the login URL', async () => {
    authState = { user: null, loading: false }
    window.history.replaceState({}, '', `/espace-client/invitation#${token}`)

    render(<ProjectInvitationAccept />, { wrapper: BrowserRouter })

    await waitFor(() => expect(window.location.pathname).toBe('/espace-client/login'))
    expect(window.location.search).toBe('?returnTo=%2Fespace-client%2Finvitation')
    expect(window.location.href).not.toContain(token)
    expect(sessionStorage.getItem('venio-project-invitation-token')).toBe(token)
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
