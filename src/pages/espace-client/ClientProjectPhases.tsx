import React, { useState } from 'react'
import ItemCard from '../../components/ItemCard'
import { useConfirm } from '../../hooks/useConfirm'
import type { PhaseStatus, ProjectAccessRole, ProjectItem, ProjectPhase } from '../../types/project.types'

const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  A_VENIR: 'À venir',
  EN_COURS: 'En cours',
  EN_ATTENTE_VALIDATION: 'En attente de votre validation',
  TERMINEE: 'Terminée',
}

const PHASE_STATUS_MODIFIERS: Record<PhaseStatus, string> = {
  A_VENIR: 'is-todo',
  EN_COURS: 'is-current',
  EN_ATTENTE_VALIDATION: 'is-waiting',
  TERMINEE: 'is-done',
}

const formatDate = (value: string): string =>
  new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

interface ClientProjectPhasesProps {
  phases: ProjectPhase[]
  accessRole: ProjectAccessRole
  onDownloadItem: (itemId: string, fileName: string) => void
  onValidate: (phaseId: string, comment: string) => Promise<void>
  onRequestRevision: (phaseId: string, comment: string) => Promise<void>
}

const ClientProjectPhases: React.FC<ClientProjectPhasesProps> = ({
  phases,
  accessRole,
  onDownloadItem,
  onValidate,
  onRequestRevision,
}) => {
  const [comments, setComments] = useState<Record<string, string>>({})
  const [pendingPhaseId, setPendingPhaseId] = useState<string | null>(null)
  const { confirm, ConfirmDialog } = useConfirm()

  const setComment = (phaseId: string, value: string) => {
    setComments((prev) => ({ ...prev, [phaseId]: value }))
  }

  // Le backend reste seul juge du verrouillage ; cette lecture n'est qu'un
  // repère visuel calculé sur les étapes déjà chargées.
  const blockingPhaseFor = (phase: ProjectPhase): ProjectPhase | undefined =>
    phases.find(
      (candidate) =>
        candidate.order < phase.order && candidate.requiresClientValidation && !candidate.validation.validatedAt,
    )

  const handleValidate = async (phase: ProjectPhase) => {
    const confirmed = await confirm({
      title: 'Valider cette étape',
      message: `Confirmez-vous la validation de l’étape « ${phase.title} » ? Elle est horodatée et enregistrée à votre nom.`,
      confirmLabel: 'Valider',
      variant: 'info',
    })
    if (!confirmed) return
    setPendingPhaseId(phase._id)
    try {
      await onValidate(phase._id, (comments[phase._id] || '').trim())
      setComment(phase._id, '')
    } finally {
      setPendingPhaseId(null)
    }
  }

  const handleRevision = async (phase: ProjectPhase) => {
    const comment = (comments[phase._id] || '').trim()
    if (!comment) return
    setPendingPhaseId(phase._id)
    try {
      await onRequestRevision(phase._id, comment)
      setComment(phase._id, '')
    } finally {
      setPendingPhaseId(null)
    }
  }

  if (phases.length === 0) {
    return (
      <div className="client-phases">
        <h2 className="client-progress-section-title">Étapes du projet</h2>
        <p className="client-phases-empty">Le déroulé du projet apparaîtra ici.</p>
      </div>
    )
  }

  return (
    <div className="client-phases">
      <h2 className="client-progress-section-title">Étapes du projet</h2>

      {phases.map((phase, index) => {
        const isWaiting = phase.status === 'EN_ATTENTE_VALIDATION'
        const blocking = phase.status === 'A_VENIR' ? blockingPhaseFor(phase) : undefined
        const openRevisions = phase.revisionRequests.filter((revision) => !revision.resolvedAt)
        const busy = pendingPhaseId === phase._id
        const comment = comments[phase._id] || ''

        return (
          <div key={phase._id} className="client-phase-row">
            <div className="client-phase-marker">
              <span className={`client-phase-dot ${PHASE_STATUS_MODIFIERS[phase.status]}`} />
              {index < phases.length - 1 && <span className="client-phase-line" />}
            </div>

            <div className={`client-phase-body ${isWaiting ? 'client-phase-card' : ''}`}>
              <div className="client-phase-head">
                <span className="client-phase-title">
                  {index + 1} · {phase.title}
                </span>
                <span className={`client-phase-badge ${PHASE_STATUS_MODIFIERS[phase.status]}`}>
                  {PHASE_STATUS_LABELS[phase.status]}
                </span>
                {phase.validation.validatedAt && (
                  <span className="client-phase-meta">
                    Validée par {phase.validation.validatedByName} le {formatDate(phase.validation.validatedAt)}
                  </span>
                )}
                {phase.dueAt && !phase.validation.validatedAt && (
                  <span className="client-phase-meta">Prévue le {formatDate(phase.dueAt)}</span>
                )}
              </div>

              {phase.description && <p className="client-phase-description">{phase.description}</p>}

              {phase.validation.validatedAt && phase.validation.comment && (
                <p className="client-phase-description">« {phase.validation.comment} »</p>
              )}

              {blocking && (
                <span className="client-phase-locked">Se débloque à la validation de « {blocking.title} »</span>
              )}

              {isWaiting && phase.linkedItems.length > 0 && (
                <div className="client-phase-items">
                  {phase.linkedItems.map((item) => (
                    <ItemCard key={item._id} item={item as ProjectItem} onDownload={onDownloadItem} />
                  ))}
                </div>
              )}

              {isWaiting && accessRole === 'OWNER' && (
                <div className="client-phase-actions">
                  <textarea
                    className="client-phase-comment"
                    placeholder="Votre commentaire (obligatoire pour des retouches)"
                    value={comment}
                    onChange={(event) => setComment(phase._id, event.target.value)}
                    rows={3}
                  />
                  <div className="client-phase-buttons">
                    <button className="client-phase-button" onClick={() => handleValidate(phase)} disabled={busy}>
                      Valider cette étape
                    </button>
                    <button
                      className="client-phase-button client-phase-button-ghost"
                      onClick={() => handleRevision(phase)}
                      disabled={busy || !comment.trim()}
                    >
                      Demander des retouches
                    </button>
                  </div>
                </div>
              )}

              {isWaiting && accessRole !== 'OWNER' && (
                <div className="client-phase-actions">
                  <span className="client-phase-meta">En attente de validation par le propriétaire du projet</span>
                  {accessRole === 'EDITOR' && (
                    <>
                      <textarea
                        className="client-phase-comment"
                        placeholder="Votre commentaire (obligatoire pour des retouches)"
                        value={comment}
                        onChange={(event) => setComment(phase._id, event.target.value)}
                        rows={3}
                      />
                      <div className="client-phase-buttons">
                        <button
                          className="client-phase-button client-phase-button-ghost"
                          onClick={() => handleRevision(phase)}
                          disabled={busy || !comment.trim()}
                        >
                          Demander des retouches
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {openRevisions.length > 0 && (
                <div className="client-phase-revisions">
                  {openRevisions.map((revision) => (
                    <div key={revision._id} className="client-phase-revision">
                      <span className="client-phase-meta">
                        Retouches demandées par {revision.requestedByName} le {formatDate(revision.createdAt)}
                      </span>
                      <p className="client-phase-description">{revision.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {ConfirmDialog}
    </div>
  )
}

export default ClientProjectPhases
