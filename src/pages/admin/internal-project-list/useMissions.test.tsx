import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../../../lib/api'
import { useMissions } from './useMissions'
import type { Mission } from './types'

vi.mock('../../../lib/api', () => ({
  apiDownload: vi.fn(),
  apiFetch: vi.fn(),
  apiUpload: vi.fn(),
}))

const mission: Mission = {
  _id: 'mission-1',
  title: 'Valider le découpage',
  description: '',
  status: 'A_FAIRE',
  dueDate: null,
  progress: 0,
  assignedTo: [],
  internalProject: { _id: 'project-1', name: 'Refonte admin', entity: 'Venio' },
  participants: [],
  steps: [],
  deliverables: [],
  files: [],
  createdAt: '2026-07-13T00:00:00.000Z',
}

describe('useMissions', () => {
  const showToast = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads missions when the Arrow or missions view is selected', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ missions: [mission] })

    const { result } = renderHook(() => useMissions({ viewTab: 'arrow', showToast }))

    await waitFor(() => expect(result.current.missions).toEqual([mission]))
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/internal-projects/missions')
  })

  it('creates a mission with the existing API payload and updates the local list', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ mission })
    const { result } = renderHook(() => useMissions({ viewTab: 'projects', showToast }))

    act(() => {
      result.current.setMissionForm({
        projectId: 'project-1',
        title: '  Valider le découpage  ',
        description: 'Sans changement de contrat',
        assignedTo: ['member-1'],
        dueDate: '2026-08-01',
      })
    })

    await act(async () => {
      await result.current.handleCreateMission({ preventDefault: vi.fn() } as unknown as React.FormEvent)
    })

    expect(apiFetch).toHaveBeenCalledWith('/api/admin/internal-projects/project-1/missions', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Valider le découpage',
        description: 'Sans changement de contrat',
        assignedTo: ['member-1'],
        dueDate: '2026-08-01',
      }),
    })
    expect(result.current.missions).toEqual([mission])
    expect(showToast).toHaveBeenCalledWith('Mission créée', 'success')
  })
})
