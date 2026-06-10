import { useState } from 'react'
import { X, Check, Plus } from 'lucide-react'
import {
  formatDate,
  updateSession,
  type EducationAssignment,
  type EducationSession,
  type EducationTemplate,
} from '../../../services/education'
import { AssignmentForm } from './assignment-parts'
import { SessionForm } from './session-parts'

/**
 * Enchaînement post-séance — checklist guidée après le passage d'une séance
 * en TERMINEE : compléter le compte-rendu, créer le devoir donné, planifier
 * la séance suivante. Les trois étapes sont optionnelles.
 *
 * Modale au-dessus du mode live (z-index 1200+) ; les forms imbriqués
 * (AssignmentForm / SessionForm) sont remontés dans une couche dédiée.
 */

/** Date de la séance + 7 jours, même heure, au format datetime-local. */
function plusSevenDaysLocal(dateIso: string): string {
  const d = new Date(dateIso)
  d.setDate(d.getDate() + 7)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function PostSessionFlow({
  session,
  templates,
  onClose,
  onChanged,
}: {
  session: EducationSession
  /** Tous kinds ; filtrés localement (assignment pour l'étape 2, session pour l'étape 3). */
  templates: EducationTemplate[]
  onClose: () => void
  onChanged: () => void
}) {
  const classId = typeof session.classId === 'string' ? session.classId : session.classId._id
  const className = typeof session.classId === 'string' ? null : session.classId.name

  // Étape 1 — compte-rendu.
  const [recap, setRecap] = useState(session.recap || '')
  const [recapSaving, setRecapSaving] = useState(false)
  const [recapDone, setRecapDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Étape 2 — devoir donné.
  const [showAssignmentForm, setShowAssignmentForm] = useState(false)
  const [createdAssignment, setCreatedAssignment] = useState<EducationAssignment | null>(null)
  const [assignmentDone, setAssignmentDone] = useState(false)

  // Étape 3 — prochaine séance.
  const [showSessionForm, setShowSessionForm] = useState(false)
  const [createdSession, setCreatedSession] = useState<EducationSession | null>(null)
  const [nextSessionDone, setNextSessionDone] = useState(false)

  async function saveRecap() {
    setRecapSaving(true)
    try {
      await updateSession(session._id, { recap })
      setRecapDone(true)
      setError(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de sauvegarde du compte-rendu')
    } finally {
      setRecapSaving(false)
    }
  }

  return (
    <>
      <div className="edu-drawer-backdrop edu-postflow-backdrop" onClick={onClose} />
      <div className="edu-drawer edu-postflow" role="dialog" aria-label="Enchaînement post-séance">
        <div className="edu-drawer-head">
          <div>
            <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
              Séance terminée — enchaînement
            </h2>
            <div className="edu-postflow-subtitle">
              {session.title}
              {className ? ` · ${className}` : ''}
            </div>
          </div>
          <button className="edu-btn-icon" onClick={onClose} title="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="edu-drawer-body">
          {error && (
            <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
              {error}
              <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={() => setError(null)}>
                Fermer
              </button>
            </div>
          )}
          <p className="edu-sub" style={{ marginBottom: 4 }}>
            Trois étapes optionnelles pour boucler la séance et préparer la suite.
          </p>

          {/* Étape 1 — compte-rendu */}
          <div className="edu-postflow-step">
            <StepBadge done={recapDone} index={1} />
            <div className="edu-postflow-step-body">
              <strong>Compléter le compte-rendu</strong>
              <textarea
                className="edu-textarea"
                value={recap}
                onChange={(e) => setRecap(e.target.value)}
                placeholder="Ce qui s'est passé, points clés, à reprendre la prochaine fois…"
                style={{ minHeight: 110 }}
                aria-label="Compte-rendu de séance"
              />
              <div>
                <button className="edu-btn" disabled={recapSaving} onClick={saveRecap}>
                  {recapSaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>

          {/* Étape 2 — devoir donné */}
          <div className="edu-postflow-step">
            <StepBadge done={assignmentDone} index={2} />
            <div className="edu-postflow-step-body">
              <strong>Créer le devoir donné</strong>
              {assignmentDone ? (
                <span className="edu-postflow-done-note">
                  Devoir créé{createdAssignment ? ` : ${createdAssignment.title}` : ''}
                </span>
              ) : (
                <div>
                  <button className="edu-btn" onClick={() => setShowAssignmentForm(true)}>
                    <Plus size={14} /> Créer un devoir
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Étape 3 — prochaine séance */}
          <div className="edu-postflow-step">
            <StepBadge done={nextSessionDone} index={3} />
            <div className="edu-postflow-step-body">
              <strong>Planifier la prochaine séance</strong>
              {nextSessionDone ? (
                <span className="edu-postflow-done-note">
                  Séance planifiée
                  {createdSession ? ` : ${createdSession.title} — ${formatDate(createdSession.date, true)}` : ''}
                </span>
              ) : (
                <div>
                  <button className="edu-btn" onClick={() => setShowSessionForm(true)}>
                    <Plus size={14} /> Planifier
                  </button>
                  <span className="edu-sub" style={{ marginLeft: 10 }}>
                    Date proposée : +7 jours, même heure.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="edu-drawer-foot">
          <button className="edu-btn" onClick={onClose}>
            Terminer
          </button>
        </div>
      </div>

      {/* Forms imbriqués remontés au-dessus de la modale (z-index 1300). */}
      {showAssignmentForm && (
        <div className="edu-postflow-form-layer">
          <AssignmentForm
            classId={classId}
            templates={templates.filter((t) => t.kind === 'assignment')}
            onClose={() => setShowAssignmentForm(false)}
            onSaved={(created) => {
              setShowAssignmentForm(false)
              setAssignmentDone(true)
              setCreatedAssignment(created ?? null)
              onChanged()
            }}
          />
        </div>
      )}
      {showSessionForm && (
        <div className="edu-postflow-form-layer">
          <SessionForm
            classId={classId}
            templates={templates.filter((t) => t.kind === 'session')}
            defaultDate={plusSevenDaysLocal(session.date)}
            onClose={() => setShowSessionForm(false)}
            onSaved={(created) => {
              setShowSessionForm(false)
              setNextSessionDone(true)
              setCreatedSession(created ?? null)
              onChanged()
            }}
          />
        </div>
      )}
    </>
  )
}

/** Pastille d'étape : numéro, ou coche verte quand l'étape est faite. */
function StepBadge({ done, index }: { done: boolean; index: number }) {
  return (
    <span className={`edu-postflow-badge${done ? ' done' : ''}`} aria-label={done ? 'Étape faite' : `Étape ${index}`}>
      {done ? <Check size={14} /> : index}
    </span>
  )
}
