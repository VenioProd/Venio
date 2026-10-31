import React, { useState } from 'react'
import { useI18n } from '../../context/I18nContext'
import { formatDate } from '../../i18n/format'
import type { MessageKey } from '../../i18n'
import ItemCard from '../../components/ItemCard'
import { useConfirm } from '../../hooks/useConfirm'
import type { PhaseStatus, ProjectAccessRole, ProjectItem, ProjectPhase } from '../../types/project.types'

const PHASE_STATUS_LABEL_KEYS: Record<PhaseStatus, MessageKey> = {
  A_VENIR: 'client.phases.statusUpcoming',
  EN_COURS: 'client.phases.statusInProgress',
  EN_ATTENTE_VALIDATION: 'client.phases.statusAwaiting',
  TERMINEE: 'client.phases.statusDone',
}

const PHASE_STATUS_MODIFIERS: Record<PhaseStatus, string> = {
  A_VENIR: 'is-todo',
  EN_COURS: 'is-current',
  EN_ATTENTE_VALIDATION: 'is-waiting',
  TERMINEE: 'is-done',
}

const formatPhaseDate = (value: string): string => formatDate(value, { day: 'numeric', month: 'long', year: 'numeric' })

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
  const { t } = useI18n()
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
      title: t('client.phases.confirmTitle'),
      message: t('client.phases.confirmMessage', { title: phase.title }),
      confirmLabel: t('client.phases.confirmLabel'),
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
        <h2 className="client-progress-section-title">{t('client.phases.title')}</h2>
        <p className="client-phases-empty">{t('client.phases.empty')}</p>
      </div>
    )
  }

  return (
    <div className="client-phases">
      <h2 className="client-progress-section-title">{t('client.phases.title')}</h2>

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
                  {t(PHASE_STATUS_LABEL_KEYS[phase.status])}
                </span>
                {phase.validation.validatedAt && (
                  <span className="client-phase-meta">
                    {t('client.phases.validatedBy', {
                      name: phase.validation.validatedByName,
                      date: formatPhaseDate(phase.validation.validatedAt),
                    })}
                  </span>
                )}
                {phase.dueAt && !phase.validation.validatedAt && (
                  <span className="client-phase-meta">
                    {t('client.phases.dueOn', { date: formatPhaseDate(phase.dueAt) })}
                  </span>
                )}
              </div>

              {phase.description && <p className="client-phase-description">{phase.description}</p>}

              {phase.validation.validatedAt && phase.validation.comment && (
                <p className="client-phase-description">« {phase.validation.comment} »</p>
              )}

              {blocking && (
                <span className="client-phase-locked">{t('client.phases.locked', { title: blocking.title })}</span>
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
                    placeholder={t('client.phases.commentPlaceholder')}
                    value={comment}
                    onChange={(event) => setComment(phase._id, event.target.value)}
                    rows={3}
                  />
                  <div className="client-phase-buttons">
                    <button className="client-phase-button" onClick={() => handleValidate(phase)} disabled={busy}>
                      {t('client.phases.approve')}
                    </button>
                    <button
                      className="client-phase-button client-phase-button-ghost"
                      onClick={() => handleRevision(phase)}
                      disabled={busy || !comment.trim()}
                    >
                      {t('client.phases.requestChanges')}
                    </button>
                  </div>
                </div>
              )}

              {isWaiting && accessRole !== 'OWNER' && (
                <div className="client-phase-actions">
                  <span className="client-phase-meta">{t('client.phases.awaitingOwner')}</span>
                  {accessRole === 'EDITOR' && (
                    <>
                      <textarea
                        className="client-phase-comment"
                        placeholder={t('client.phases.commentPlaceholder')}
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
                          {t('client.phases.requestChanges')}
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
                        {t('client.phases.changesRequested', {
                          name: revision.requestedByName,
                          date: formatPhaseDate(revision.createdAt),
                        })}
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
