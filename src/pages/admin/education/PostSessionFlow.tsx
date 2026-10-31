import { useState } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { X, Check, Plus } from 'lucide-react'
import {
  updateSession,
  type EducationAssignment,
  type EducationSession,
  type EducationTemplate,
} from '../../../services/education'
import { AssignmentForm } from './assignment-parts'
import { SessionForm } from './session-parts'
import { formatShortDate as formatDate } from './eduFormat'

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
  const { t } = useI18n()
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
      setError(err instanceof Error ? err.message : translate('eduB.postFlow.recapSaveFailed'))
    } finally {
      setRecapSaving(false)
    }
  }

  return (
    <>
      <div className="edu-drawer-backdrop edu-postflow-backdrop" onClick={onClose} />
      <div className="edu-drawer edu-postflow" role="dialog" aria-label={t('eduB.postFlow.dialog')}>
        <div className="edu-drawer-head">
          <div>
            <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
              {t('eduB.postFlow.title')}
            </h2>
            <div className="edu-postflow-subtitle">
              {session.title}
              {className ? ` · ${className}` : ''}
            </div>
          </div>
          <button className="edu-btn-icon" onClick={onClose} title={t('common.close')}>
            <X size={18} />
          </button>
        </div>

        <div className="edu-drawer-body">
          {error && (
            <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
              {error}
              <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={() => setError(null)}>
                {t('common.close')}
              </button>
            </div>
          )}
          <p className="edu-sub" style={{ marginBottom: 4 }}>
            {t('eduB.postFlow.intro')}
          </p>

          {/* Étape 1 — compte-rendu */}
          <div className="edu-postflow-step">
            <StepBadge done={recapDone} index={1} />
            <div className="edu-postflow-step-body">
              <strong>{t('eduB.postFlow.step1')}</strong>
              <textarea
                className="edu-textarea"
                value={recap}
                onChange={(e) => setRecap(e.target.value)}
                placeholder={t('eduB.postFlow.recapPlaceholder')}
                style={{ minHeight: 110 }}
                aria-label={t('eduB.shared.recapTitle')}
              />
              <div>
                <button className="edu-btn" disabled={recapSaving} onClick={saveRecap}>
                  {recapSaving ? t('eduB.autosave.saving') : t('common.save')}
                </button>
              </div>
            </div>
          </div>

          {/* Étape 2 — devoir donné */}
          <div className="edu-postflow-step">
            <StepBadge done={assignmentDone} index={2} />
            <div className="edu-postflow-step-body">
              <strong>{t('eduB.postFlow.step2')}</strong>
              {assignmentDone ? (
                <span className="edu-postflow-done-note">
                  {createdAssignment
                    ? t('eduB.postFlow.assignmentDoneNamed', { title: createdAssignment.title })
                    : t('eduB.postFlow.assignmentDone')}
                </span>
              ) : (
                <div>
                  <button className="edu-btn" onClick={() => setShowAssignmentForm(true)}>
                    <Plus size={14} /> {t('eduB.postFlow.createAssignment')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Étape 3 — prochaine séance */}
          <div className="edu-postflow-step">
            <StepBadge done={nextSessionDone} index={3} />
            <div className="edu-postflow-step-body">
              <strong>{t('eduB.postFlow.step3')}</strong>
              {nextSessionDone ? (
                <span className="edu-postflow-done-note">
                  {createdSession
                    ? t('eduB.postFlow.sessionDoneNamed', {
                        title: createdSession.title,
                        date: formatDate(createdSession.date, true),
                      })
                    : t('eduB.postFlow.sessionDone')}
                </span>
              ) : (
                <div>
                  <button className="edu-btn" onClick={() => setShowSessionForm(true)}>
                    <Plus size={14} /> {t('eduB.postFlow.schedule')}
                  </button>
                  <span className="edu-sub" style={{ marginLeft: 10 }}>
                    {t('eduB.postFlow.proposedDate')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="edu-drawer-foot">
          <button className="edu-btn" onClick={onClose}>
            {t('eduB.postFlow.finish')}
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
  const { t } = useI18n()
  return (
    <span
      className={`edu-postflow-badge${done ? ' done' : ''}`}
      aria-label={done ? t('eduB.postFlow.stepDone') : t('eduB.postFlow.stepN', { n: index })}
    >
      {done ? <Check size={14} /> : index}
    </span>
  )
}
