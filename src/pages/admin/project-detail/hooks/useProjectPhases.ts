import { useCallback, useState, type FormEvent } from 'react'
import { apiFetch, ApiError } from '../../../../lib/api'
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

const TRANSITION_ERRORS: Record<PhaseTransition, string> = {
  start: 'Erreur au démarrage de l’étape',
  'request-validation': 'Erreur à la demande de validation',
  complete: 'Erreur à la clôture de l’étape',
  'cancel-validation-request': 'Erreur à l’annulation de la demande',
  revert: 'Erreur à la réouverture de l’étape',
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
      setError((err as Error).message || 'Erreur chargement des étapes')
    }
  }, [projectId, canViewPhases, setError])

  /** Les refus métier du backend portent un code : on les traduit pour l'admin. */
  const reportError = (err: unknown, fallback: string) => {
    if (err instanceof ApiError) {
      const payload = (err.payload || {}) as { code?: string; blockingPhase?: { title?: string } }
      if (payload.code === 'PHASE_LOCKED' && payload.blockingPhase?.title) {
        setError(
          `Impossible de démarrer cette étape : « ${payload.blockingPhase.title} » doit d’abord être validée par le client.`,
        )
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
    if (!ensurePermission(canManagePhases, 'Accès en lecture seule.')) return
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
      reportError(err, 'Erreur enregistrement de l’étape')
    }
  }

  const handleDeletePhase = async (phaseId: string) => {
    if (!ensurePermission(canManagePhases, 'Accès en lecture seule.')) return
    if (!(await confirm({ message: 'Supprimer cette étape ?', title: 'Suppression' }))) return
    setError('')
    try {
      await apiFetch(`/api/admin/projects/${projectId}/phases/${phaseId}`, { method: 'DELETE' })
      if (editingPhaseId === phaseId) cancelEditPhase()
      await loadPhases()
    } catch (err: unknown) {
      reportError(err, 'Erreur suppression de l’étape')
    }
  }

  const handleTransition = async (phaseId: string, transition: PhaseTransition) => {
    setError('')
    if (!ensurePermission(canManagePhases, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/projects/${projectId}/phases/${phaseId}/${transition}`, { method: 'POST' })
      await loadPhases()
    } catch (err: unknown) {
      reportError(err, TRANSITION_ERRORS[transition])
    }
  }

  const handleMovePhase = async (phaseId: string, direction: -1 | 1) => {
    setError('')
    if (!ensurePermission(canManagePhases, 'Accès en lecture seule.')) return
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
      reportError(err, 'Erreur réordonnancement des étapes')
    }
  }

  const handleResolveRevision = async (phaseId: string, revisionId: string) => {
    setError('')
    if (!ensurePermission(canManagePhases, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/projects/${projectId}/phases/${phaseId}/revisions/${revisionId}/resolve`, {
        method: 'POST',
      })
      await loadPhases()
    } catch (err: unknown) {
      reportError(err, 'Erreur traitement de la demande de retouches')
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
