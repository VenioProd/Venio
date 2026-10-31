import { useCallback, useState, type FormEvent } from 'react'
import { apiFetch, ApiError } from '../../../../lib/api'
import { translate } from '../../../../i18n'
import type { MessageKey } from '../../../../i18n'
import type { ProjectPhase } from '../../../../types/project.types'

export type PhaseTransition = 'start' | 'request-validation' | 'complete' | 'cancel-validation-request' | 'revert'

export interface PhaseForm {
  title: string
  description: string
  dueAt: string
  requiresClientValidation: boolean
  linkedItems: string[]
}

const initialPhaseForm: PhaseForm = {
  title: '',
  description: '',
  dueAt: '',
  requiresClientValidation: false,
  linkedItems: [],
}

const TRANSITION_ERROR_KEYS: Record<PhaseTransition, MessageKey> = {
  start: 'projects.phases.err.start',
  'request-validation': 'projects.phases.err.requestValidation',
  complete: 'projects.phases.err.complete',
  'cancel-validation-request': 'projects.phases.err.cancelRequest',
  revert: 'projects.phases.err.revert',
}

interface UseProjectPhasesOptions {
  projectId?: string
  canViewPhases: boolean
  canManagePhases: boolean
  confirm: (options: { message: string; title?: string }) => Promise<boolean>
  ensurePermission: (allowed: boolean, message: string) => boolean
  setError: (error: string) => void
}

export function useProjectPhases({
  projectId,
  canViewPhases,
  canManagePhases,
  confirm,
  ensurePermission,
  setError,
}: UseProjectPhasesOptions) {
  const [phases, setPhases] = useState<ProjectPhase[]>([])
  const [phaseForm, setPhaseForm] = useState<PhaseForm>(initialPhaseForm)
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null)

  const loadPhases = useCallback(async () => {
    if (!projectId || !canViewPhases) return
    try {
      const data = await apiFetch<{ phases?: ProjectPhase[] }>(`/api/admin/projects/${projectId}/phases`)
      setPhases(data.phases || [])
    } catch (err: unknown) {
      setError((err as Error).message || translate('projects.phases.err.load'))
    }
  }, [projectId, canViewPhases, setError])

  /** Les refus métier du backend portent un code : on les traduit pour l'admin. */
  const reportError = (err: unknown, fallback: string) => {
    if (err instanceof ApiError) {
      const payload = (err.payload || {}) as { code?: string; blockingPhase?: { title?: string } }
      if (payload.code === 'PHASE_LOCKED' && payload.blockingPhase?.title) {
        setError(translate('projects.phases.err.locked', { title: payload.blockingPhase.title }))
        return
      }
    }
    setError((err as Error).message || fallback)
  }

  const startEditPhase = (phase: ProjectPhase) => {
    setEditingPhaseId(phase._id)
    setPhaseForm({
      title: phase.title,
      description: phase.description || '',
      dueAt: phase.dueAt ? phase.dueAt.slice(0, 10) : '',
      requiresClientValidation: phase.requiresClientValidation,
      linkedItems: phase.linkedItems.map((item) => item._id),
    })
  }

  const cancelEditPhase = () => {
    setEditingPhaseId(null)
    setPhaseForm(initialPhaseForm)
  }

  const handleSubmitPhase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!ensurePermission(canManagePhases, translate('projects.detail.readOnly'))) return
    try {
      const path = editingPhaseId
        ? `/api/admin/projects/${projectId}/phases/${editingPhaseId}`
        : `/api/admin/projects/${projectId}/phases`
      await apiFetch(path, {
        method: editingPhaseId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          title: phaseForm.title,
          description: phaseForm.description,
          dueAt: phaseForm.dueAt || null,
          requiresClientValidation: phaseForm.requiresClientValidation,
          linkedItems: phaseForm.linkedItems,
        }),
      })
      cancelEditPhase()
      await loadPhases()
    } catch (err: unknown) {
      reportError(err, translate('projects.phases.err.save'))
    }
  }

  const handleDeletePhase = async (phaseId: string) => {
    if (!ensurePermission(canManagePhases, translate('projects.detail.readOnly'))) return
    if (
      !(await confirm({
        message: translate('projects.phases.confirmDelete'),
        title: translate('projects.phases.confirmDeleteTitle'),
      }))
    )
      return
    setError('')
    try {
      await apiFetch(`/api/admin/projects/${projectId}/phases/${phaseId}`, { method: 'DELETE' })
      if (editingPhaseId === phaseId) cancelEditPhase()
      await loadPhases()
    } catch (err: unknown) {
      reportError(err, translate('projects.phases.err.delete'))
    }
  }

  const handleTransition = async (phaseId: string, transition: PhaseTransition) => {
    setError('')
    if (!ensurePermission(canManagePhases, translate('projects.detail.readOnly'))) return
    try {
      await apiFetch(`/api/admin/projects/${projectId}/phases/${phaseId}/${transition}`, { method: 'POST' })
      await loadPhases()
    } catch (err: unknown) {
      reportError(err, translate(TRANSITION_ERROR_KEYS[transition]))
    }
  }

  const handleMovePhase = async (phaseId: string, direction: -1 | 1) => {
    setError('')
    if (!ensurePermission(canManagePhases, translate('projects.detail.readOnly'))) return
    const index = phases.findIndex((phase) => phase._id === phaseId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= phases.length) return

    const phaseIds = phases.map((phase) => phase._id)
    ;[phaseIds[index], phaseIds[target]] = [phaseIds[target], phaseIds[index]]

    try {
      await apiFetch(`/api/admin/projects/${projectId}/phases/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ phaseIds }),
      })
      await loadPhases()
    } catch (err: unknown) {
      reportError(err, translate('projects.phases.err.reorder'))
    }
  }

  const handleResolveRevision = async (phaseId: string, revisionId: string) => {
    setError('')
    if (!ensurePermission(canManagePhases, translate('projects.detail.readOnly'))) return
    try {
      await apiFetch(`/api/admin/projects/${projectId}/phases/${phaseId}/revisions/${revisionId}/resolve`, {
        method: 'POST',
      })
      await loadPhases()
    } catch (err: unknown) {
      reportError(err, translate('projects.phases.err.resolve'))
    }
  }

  return {
    phases,
    phaseForm,
    setPhaseForm,
    editingPhaseId,
    loadPhases,
    startEditPhase,
    cancelEditPhase,
    handleSubmitPhase,
    handleDeletePhase,
    handleTransition,
    handleMovePhase,
    handleResolveRevision,
  }
}
