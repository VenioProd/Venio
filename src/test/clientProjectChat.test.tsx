import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const apiFetch = vi.fn()

vi.mock('../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'viewer-id', name: 'Lecteur' } }),
}))

import ClientProjectChat from '../components/ClientProjectChat'

describe('ClientProjectChat collaboration permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiFetch.mockResolvedValue({ messages: [] })
  })

  it('renders a non-mutating read-only composer for viewers', async () => {
    render(<ClientProjectChat projectId="project-1" canComment={false} />)

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/projects/project-1/messages'))
    expect(screen.getByPlaceholderText('Lecture seule')).toBeDisabled()
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText('Vous avez un accès en lecture seule.')).toBeInTheDocument()
  })
})
