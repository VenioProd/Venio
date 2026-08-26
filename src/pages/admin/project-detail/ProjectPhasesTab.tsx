import React, { type FormEvent } from 'react'
import type { PhaseStatus, ProjectItem, ProjectPhase } from '../../../types/project.types'
import type { PhaseForm, PhaseTransition } from './hooks/useProjectPhases'

const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  A_VENIR: 'À venir',
  EN_COURS: 'En cours',
  EN_ATTENTE_VALIDATION: 'En attente de validation client',
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

/** Transitions proposées par statut — miroir exact du tableau backend. */
function transitionsFor(phase: ProjectPhase): Array<{ label: string; transition: PhaseTransition }> {
  switch (phase.status) {
    case 'A_VENIR':
      return [{ label: 'Démarrer', transition: 'start' }]
    case 'EN_COURS':
      return phase.requiresClientValidation
        ? [
            { label: 'Demander la validation client', transition: 'request-validation' },
            { label: 'Remettre à venir', transition: 'revert' },
          ]
        : [
            { label: 'Marquer terminée', transition: 'complete' },
            { label: 'Remettre à venir', transition: 'revert' },
          ]
    case 'EN_ATTENTE_VALIDATION':
      return [{ label: 'Annuler la demande', transition: 'cancel-validation-request' }]
    case 'TERMINEE':
      // Une étape validée par le client ne se rouvre pas (hors périmètre assumé).
      return phase.validation.validatedAt ? [] : [{ label: 'Rouvrir', transition: 'revert' }]
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
  const toggleLinkedItem = (itemId: string) => {
    const next = phaseForm.linkedItems.includes(itemId)
      ? phaseForm.linkedItems.filter((id) => id !== itemId)
      : [...phaseForm.linkedItems, itemId]
    setPhaseForm({ ...phaseForm, linkedItems: next })
  }

  return (
    <div className="admin-form-section" style={{ marginTop: 24 }}>
      <h2>Étapes de production</h2>

      {phases.length === 0 && <p className="client-phases-empty">Aucune étape pour ce projet.</p>}

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
                {PHASE_STATUS_LABELS[phase.status]}
              </span>
              {phase.requiresClientValidation && <span className="client-phase-badge">Validation client requise</span>}
              {phase.dueAt && <span className="client-phase-meta">Échéance : {formatDate(phase.dueAt)}</span>}
              {validated && (
                <span className="client-phase-meta">
                  Validée par {phase.validation.validatedByName} le {formatDate(phase.validation.validatedAt as string)}
                </span>
              )}
              {openRevisions.length > 0 && (
                <span className="client-phase-badge is-waiting">
                  {openRevisions.length} retouche{openRevisions.length > 1 ? 's' : ''} en attente
                </span>
              )}
            </div>

            {phase.description && <p className="client-phase-description">{phase.description}</p>}

            {phase.linkedItems.length > 0 && (
              <ul className="admin-phase-items">
                {phase.linkedItems.map((item) => (
                  <li key={item._id} className="client-phase-meta">
                    {item.title}
                    {item.isVisible === false && <strong> — Masqué au client</strong>}
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
                  Monter
                </button>
                <button
                  type="button"
                  className="client-phase-button client-phase-button-ghost"
                  onClick={() => onMovePhase(phase._id, 1)}
                  disabled={index === phases.length - 1}
                >
                  Descendre
                </button>
                <button
                  type="button"
                  className="client-phase-button client-phase-button-ghost"
                  onClick={() => onStartEdit(phase)}
                  disabled={validated}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  className="client-phase-button client-phase-button-ghost"
                  onClick={() => onDeletePhase(phase._id)}
                  disabled={validated}
                >
                  Supprimer
                </button>
              </div>
            )}

            {openRevisions.length > 0 && (
              <div className="client-phase-revisions">
                {openRevisions.map((revision) => (
                  <div key={revision._id} className="client-phase-revision">
                    <span className="client-phase-meta">
                      {revision.requestedByName} · {formatDate(revision.createdAt)}
                    </span>
                    <p className="client-phase-description">{revision.comment}</p>
                    {canManagePhases && (
                      <button
                        type="button"
                        className="client-phase-button client-phase-button-ghost"
                        onClick={() => onResolveRevision(phase._id, revision._id)}
                      >
                        Marquer traitée
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
          <h3>{editingPhaseId ? 'Modifier l’étape' : 'Ajouter une étape'}</h3>
          <label htmlFor="phase-title">Titre de l’étape</label>
          <input
            id="phase-title"
            className="portal-input"
            value={phaseForm.title}
            onChange={(event) => setPhaseForm({ ...phaseForm, title: event.target.value })}
            required
          />

          <label htmlFor="phase-description">Description</label>
          <textarea
            id="phase-description"
            className="portal-input"
            rows={3}
            value={phaseForm.description}
            onChange={(event) => setPhaseForm({ ...phaseForm, description: event.target.value })}
          />

          <label htmlFor="phase-due">Échéance indicative</label>
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
            Validation client requise
          </label>

          <fieldset className="admin-phase-items-picker">
            <legend>Livrables liés</legend>
            {items.length === 0 && <span className="client-phase-meta">Aucun livrable dans ce projet.</span>}
            {items.map((item) => (
              <label key={item._id} className="client-phase-meta">
                <input
                  type="checkbox"
                  checked={phaseForm.linkedItems.includes(item._id)}
                  onChange={() => toggleLinkedItem(item._id)}
                />{' '}
                {item.title}
                {!item.isVisible && <strong> — Masqué au client</strong>}
              </label>
            ))}
          </fieldset>

          <div className="client-phase-buttons">
            <button type="submit" className="client-phase-button">
              {editingPhaseId ? 'Enregistrer' : 'Ajouter l’étape'}
            </button>
            {editingPhaseId && (
              <button type="button" className="client-phase-button client-phase-button-ghost" onClick={onCancelEdit}>
                Annuler
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}

export default ProjectPhasesTab
