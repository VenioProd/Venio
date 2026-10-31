import React, { type FormEvent } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { formatDate as formatLocaleDate } from '../../../i18n/format'
import { translate } from '../../../i18n'
import type { MessageKey } from '../../../i18n'
import type { PhaseStatus, ProjectItem, ProjectPhase } from '../../../types/project.types'
import type { PhaseForm, PhaseTransition } from './hooks/useProjectPhases'

const PHASE_STATUS_LABEL_KEYS: Record<PhaseStatus, MessageKey> = {
  A_VENIR: 'projects.phases.statusUpcoming',
  EN_COURS: 'projects.phases.statusInProgress',
  EN_ATTENTE_VALIDATION: 'projects.phases.statusAwaitingValidation',
  TERMINEE: 'projects.phases.statusDone',
}

const PHASE_STATUS_MODIFIERS: Record<PhaseStatus, string> = {
  A_VENIR: 'is-todo',
  EN_COURS: 'is-current',
  EN_ATTENTE_VALIDATION: 'is-waiting',
  TERMINEE: 'is-done',
}

const formatDate = (value: string): string =>
  formatLocaleDate(value, { day: 'numeric', month: 'long', year: 'numeric' })

/** Transitions proposées par statut — miroir exact du tableau backend. */
function transitionsFor(phase: ProjectPhase): Array<{ label: string; transition: PhaseTransition }> {
  switch (phase.status) {
    case 'A_VENIR':
      return [{ label: translate('projects.phases.start'), transition: 'start' }]
    case 'EN_COURS':
      return phase.requiresClientValidation
        ? [
            { label: translate('projects.phases.requestValidation'), transition: 'request-validation' },
            { label: translate('projects.phases.revert'), transition: 'revert' },
          ]
        : [
            { label: translate('projects.phases.complete'), transition: 'complete' },
            { label: translate('projects.phases.revert'), transition: 'revert' },
          ]
    case 'EN_ATTENTE_VALIDATION':
      return [{ label: translate('projects.phases.cancelRequest'), transition: 'cancel-validation-request' }]
    case 'TERMINEE':
      // Une étape validée par le client ne se rouvre pas (hors périmètre assumé).
      return phase.validation.validatedAt ? [] : [{ label: translate('projects.phases.reopen'), transition: 'revert' }]
    default:
      return []
  }
}

interface ProjectPhasesTabProps {
  phases: ProjectPhase[]
  items: ProjectItem[]
  phaseForm: PhaseForm
  setPhaseForm: (form: PhaseForm) => void
  editingPhaseId: string | null
  canManagePhases: boolean
  onSubmitPhase: (event: FormEvent<HTMLFormElement>) => void
  onStartEdit: (phase: ProjectPhase) => void
  onCancelEdit: () => void
  onDeletePhase: (phaseId: string) => void
  onTransition: (phaseId: string, transition: PhaseTransition) => void
  onMovePhase: (phaseId: string, direction: -1 | 1) => void
  onResolveRevision: (phaseId: string, revisionId: string) => void
}

const ProjectPhasesTab: React.FC<ProjectPhasesTabProps> = ({
  phases,
  items,
  phaseForm,
  setPhaseForm,
  editingPhaseId,
  canManagePhases,
  onSubmitPhase,
  onStartEdit,
  onCancelEdit,
  onDeletePhase,
  onTransition,
  onMovePhase,
  onResolveRevision,
}) => {
  const { t } = useI18n()
  const toggleLinkedItem = (itemId: string) => {
    const next = phaseForm.linkedItems.includes(itemId)
      ? phaseForm.linkedItems.filter((id) => id !== itemId)
      : [...phaseForm.linkedItems, itemId]
    setPhaseForm({ ...phaseForm, linkedItems: next })
  }

  return (
    <div className="admin-form-section" style={{ marginTop: 24 }}>
      <h2>{t('projects.phases.heading')}</h2>

      {phases.length === 0 && <p className="client-phases-empty">{t('projects.phases.empty')}</p>}

      {phases.map((phase, index) => {
        const validated = Boolean(phase.validation.validatedAt)
        const openRevisions = phase.revisionRequests.filter((revision) => !revision.resolvedAt)

        return (
          <div key={phase._id} className="admin-phase-row">
            <div className="client-phase-head">
              <span className="client-phase-title">
                {index + 1} · {phase.title}
              </span>
              <span className={`client-phase-badge ${PHASE_STATUS_MODIFIERS[phase.status]}`}>
                {t(PHASE_STATUS_LABEL_KEYS[phase.status])}
              </span>
              {phase.requiresClientValidation && (
                <span className="client-phase-badge">{t('projects.phases.clientValidationRequired')}</span>
              )}
              {phase.dueAt && (
                <span className="client-phase-meta">
                  {t('projects.phases.dueDate', { date: formatDate(phase.dueAt) })}
                </span>
              )}
              {validated && (
                <span className="client-phase-meta">
                  {t('projects.phases.validatedBy', {
                    name: phase.validation.validatedByName,
                    date: formatDate(phase.validation.validatedAt as string),
                  })}
                </span>
              )}
              {openRevisions.length > 0 && (
                <span className="client-phase-badge is-waiting">
                  {t('projects.phases.openRevisions', { count: openRevisions.length })}
                </span>
              )}
            </div>

            {phase.description && <p className="client-phase-description">{phase.description}</p>}

            {phase.linkedItems.length > 0 && (
              <ul className="admin-phase-items">
                {phase.linkedItems.map((item) => (
                  <li key={item._id} className="client-phase-meta">
                    {item.title}
                    {item.isVisible === false && <strong>{t('projects.phases.hiddenFromClient')}</strong>}
                  </li>
                ))}
              </ul>
            )}

            {canManagePhases && (
              <div className="client-phase-buttons" style={{ marginTop: 12 }}>
                {transitionsFor(phase).map((action) => (
                  <button
                    key={action.transition}
                    type="button"
                    className="client-phase-button"
                    onClick={() => onTransition(phase._id, action.transition)}
                  >
                    {action.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="client-phase-button client-phase-button-ghost"
                  onClick={() => onMovePhase(phase._id, -1)}
                  disabled={index === 0}
                >
                  {t('projects.phases.moveUp')}
                </button>
                <button
                  type="button"
                  className="client-phase-button client-phase-button-ghost"
                  onClick={() => onMovePhase(phase._id, 1)}
                  disabled={index === phases.length - 1}
                >
                  {t('projects.phases.moveDown')}
                </button>
                <button
                  type="button"
                  className="client-phase-button client-phase-button-ghost"
                  onClick={() => onStartEdit(phase)}
                  disabled={validated}
                >
                  {t('projects.phases.edit')}
                </button>
                <button
                  type="button"
                  className="client-phase-button client-phase-button-ghost"
                  onClick={() => onDeletePhase(phase._id)}
                  disabled={validated}
                >
                  {t('projects.phases.delete')}
                </button>
              </div>
            )}

            {phase.revisionRequests.length > 0 && (
              <div className="client-phase-revisions">
                {/* L'historique complet reste visible côté admin : une demande traitée
                    garde sa trace, seule l'action de traitement disparaît. */}
                {phase.revisionRequests.map((revision) => (
                  <div key={revision._id} className="client-phase-revision">
                    <span className="client-phase-meta">
                      {revision.requestedByName} · {formatDate(revision.createdAt)}
                    </span>
                    <span className={`client-phase-badge ${revision.resolvedAt ? 'is-done' : 'is-waiting'}`}>
                      {revision.resolvedAt
                        ? t('projects.phases.resolvedOn', { date: formatDate(revision.resolvedAt) })
                        : t('projects.phases.pending')}
                    </span>
                    <p className="client-phase-description">{revision.comment}</p>
                    {canManagePhases && !revision.resolvedAt && (
                      <button
                        type="button"
                        className="client-phase-button client-phase-button-ghost"
                        onClick={() => onResolveRevision(phase._id, revision._id)}
                      >
                        {t('projects.phases.markResolved')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {canManagePhases && (
        <form onSubmit={onSubmitPhase} className="admin-phase-form">
          <h3>{editingPhaseId ? t('projects.phases.editStep') : t('projects.phases.addStepHeading')}</h3>
          <label htmlFor="phase-title">{t('projects.phases.stepTitle')}</label>
          <input
            id="phase-title"
            className="portal-input"
            value={phaseForm.title}
            onChange={(event) => setPhaseForm({ ...phaseForm, title: event.target.value })}
            required
          />

          <label htmlFor="phase-description">{t('projects.phases.description')}</label>
          <textarea
            id="phase-description"
            className="portal-input"
            rows={3}
            value={phaseForm.description}
            onChange={(event) => setPhaseForm({ ...phaseForm, description: event.target.value })}
          />

          <label htmlFor="phase-due">{t('projects.phases.indicativeDue')}</label>
          <input
            id="phase-due"
            type="date"
            className="portal-input"
            value={phaseForm.dueAt}
            onChange={(event) => setPhaseForm({ ...phaseForm, dueAt: event.target.value })}
          />

          <label>
            <input
              type="checkbox"
              checked={phaseForm.requiresClientValidation}
              onChange={(event) => setPhaseForm({ ...phaseForm, requiresClientValidation: event.target.checked })}
            />{' '}
            {t('projects.phases.clientValidationRequired')}
          </label>

          <fieldset className="admin-phase-items-picker">
            <legend>{t('projects.phases.linkedDeliverables')}</legend>
            {items.length === 0 && <span className="client-phase-meta">{t('projects.phases.noDeliverable')}</span>}
            {items.map((item) => (
              <label key={item._id} className="client-phase-meta">
                <input
                  type="checkbox"
                  checked={phaseForm.linkedItems.includes(item._id)}
                  onChange={() => toggleLinkedItem(item._id)}
                />{' '}
                {item.title}
                {!item.isVisible && <strong>{t('projects.phases.hiddenFromClient')}</strong>}
              </label>
            ))}
          </fieldset>

          <div className="client-phase-buttons">
            <button type="submit" className="client-phase-button">
              {editingPhaseId ? t('projects.phases.save') : t('projects.phases.addStep')}
            </button>
            {editingPhaseId && (
              <button type="button" className="client-phase-button client-phase-button-ghost" onClick={onCancelEdit}>
                {t('projects.phases.cancel')}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}

export default ProjectPhasesTab
