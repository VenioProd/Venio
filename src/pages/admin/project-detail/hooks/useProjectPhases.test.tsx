import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, ApiError } from '../../../../lib/api'
import { useProjectPhases } from './useProjectPhases'
import type { ProjectPhase } from '../../../../types/project.types'

vi.mock('../../../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/api')>('../../../../lib/api')
  return { ...actual, apiFetch: vi.fn(), apiDownload: vi.fn(), apiUpload: vi.fn() }
})

const phase = (overrides: Partial<ProjectPhase> = {}): ProjectPhase => ({
  _id: 'phase-1',
  title: 'Cadrage',
  description: '',
  order: 0,
  dueAt: null,
  status: 'A_VENIR',
  requiresClientValidation: false,
  linkedItems: [],
  validation: { validatedByName: '', validatedAt: null, comment: '' },
  revisionRequests: [],
  ...overrides,
})

describe('useProjectPhases', () => {
  const confirm = vi.fn()
  const ensurePermission = vi.fn()
  const setError = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ensurePermission.mockReturnValue(true)
    confirm.mockResolvedValue(true)
    vi.mocked(apiFetch).mockResolvedValue({ phases: [] })
  })

  function renderPhasesHook(canManagePhases = true) {
    return renderHook(() =>
      useProjectPhases({
        projectId: 'project-1',
        canViewPhases: true,
        canManagePhases,
        confirm,
        ensurePermission,
        setError,
      }),
    )
  }

  it('charge les étapes du projet', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ phases: [phase()] })
    const { result } = renderPhasesHook()

    await act(async () => {
      await result.current.loadPhases()
    })

    expect(apiFetch).toHaveBeenCalledWith('/api/admin/projects/project-1/phases')
    expect(result.current.phases).toHaveLength(1)
  })

  it('crée une étape puis réinitialise le formulaire', async () => {
    const { result } = renderPhasesHook()
    act(() => {
      result.current.setPhaseForm({
        title: 'Maquettes',
        description: 'Cinq pages',
        dueAt: '2026-09-30',
        requiresClientValidation: true,
        linkedItems: ['item-1'],
      })
    })

    await act(async () => {
      await result.current.handleSubmitPhase({ preventDefault: vi.fn() } as never)
    })

    expect(apiFetch).toHaveBeenCalledWith('/api/admin/projects/project-1/phases', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Maquettes',
        description: 'Cinq pages',
        dueAt: '2026-09-30',
        requiresClientValidation: true,
        linkedItems: ['item-1'],
      }),
    })
    expect(result.current.phaseForm.title).toBe('')
    expect(result.current.phaseForm.requiresClientValidation).toBe(false)
  })

  it('bascule en édition et envoie un PATCH sur l’étape sélectionnée', async () => {
    const { result } = renderPhasesHook()
    act(() => {
      result.current.startEditPhase(phase({ _id: 'phase-9', title: 'Recette', dueAt: '2026-09-30T00:00:00.000Z' }))
    })
    expect(result.current.editingPhaseId).toBe('phase-9')
    expect(result.current.phaseForm.title).toBe('Recette')
    expect(result.current.phaseForm.dueAt).toBe('2026-09-30')

    await act(async () => {
      await result.current.handleSubmitPhase({ preventDefault: vi.fn() } as never)
    })

    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe('/api/admin/projects/project-1/phases/phase-9')
    expect(vi.mocked(apiFetch).mock.calls[0][1]).toMatchObject({ method: 'PATCH' })
    expect(result.current.editingPhaseId).toBeNull()
  })

  it('appelle l’endpoint de transition correspondant', async () => {
    const { result } = renderPhasesHook()
    await act(async () => {
      await result.current.handleTransition('phase-1', 'request-validation')
    })

    expect(apiFetch).toHaveBeenCalledWith('/api/admin/projects/project-1/phases/phase-1/request-validation', {
      method: 'POST',
    })
  })

  it('affiche l’étape bloquante sur un 409 PHASE_LOCKED', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(
      new ApiError(409, 'Étape verrouillée', {
        code: 'PHASE_LOCKED',
        blockingPhase: { _id: 'p0', title: 'Maquettes' },
      }),
    )
    const { result } = renderPhasesHook()

    await act(async () => {
      await result.current.handleTransition('phase-1', 'start')
    })

    expect(setError).toHaveBeenCalledWith(
      'Impossible de démarrer cette étape : « Maquettes » doit d’abord être validée par le client.',
    )
  })

  it('réordonne en envoyant la liste complète des ids', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      phases: [phase({ _id: 'a', order: 0 }), phase({ _id: 'b', order: 1 }), phase({ _id: 'c', order: 2 })],
    })
    const { result } = renderPhasesHook()
    await act(async () => {
      await result.current.loadPhases()
    })
    vi.mocked(apiFetch).mockClear()
    vi.mocked(apiFetch).mockResolvedValue({ phases: [] })

    await act(async () => {
      await result.current.handleMovePhase('c', -1)
    })

    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe('/api/admin/projects/project-1/phases/reorder')
    expect(JSON.parse((vi.mocked(apiFetch).mock.calls[0][1] as { body: string }).body)).toEqual({
      phaseIds: ['a', 'c', 'b'],
    })
  })

  it('supprime après confirmation et résout une demande de retouches', async () => {
    const { result } = renderPhasesHook()

    await act(async () => {
      await result.current.handleDeletePhase('phase-1')
    })
    expect(confirm).toHaveBeenCalled()
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe('/api/admin/projects/project-1/phases/phase-1')
    expect(vi.mocked(apiFetch).mock.calls[0][1]).toMatchObject({ method: 'DELETE' })

    vi.mocked(apiFetch).mockClear()
    await act(async () => {
      await result.current.handleResolveRevision('phase-1', 'rev-1')
    })
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe(
      '/api/admin/projects/project-1/phases/phase-1/revisions/rev-1/resolve',
    )
  })

  it('bloque les mutations sans la permission manage_phases', async () => {
    ensurePermission.mockReturnValue(false)
    const { result } = renderPhasesHook(false)

    await act(async () => {
      await result.current.handleTransition('phase-1', 'start')
    })

    expect(apiFetch).not.toHaveBeenCalled()
  })
})
