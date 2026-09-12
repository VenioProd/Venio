import { WorkspaceOverlayPortal } from '../../../components/WorkspaceOverlayPortal'
import { useCallback, useEffect, useState } from 'react'
import { X, ChevronDown, ChevronRight, Play } from 'lucide-react'
import {
  ATTENDANCE_COLOR,
  ATTENDANCE_LABEL,
  SESSION_STATUS_LABEL,
  formatDate,
  getSession,
  studentDisplayName,
  updateAttendance,
  updateSession,
  type AttendanceState,
  type EducationSession,
  type EducationSessionStatus,
  type EducationTemplate,
} from '../../../services/education'
import { SessionLiveMode } from './SessionLiveMode'
import { DocumentsPanel } from './DocumentsPanel'
import { useEducationAutosave } from './useEducationAutosave'
import { AutosaveStatus } from './AutosaveStatus'
import { PostSessionFlow } from './PostSessionFlow'
import { EducationAiDraftPanel } from './EducationAiDraft'
import { DutiesSection, LinksSection, NotesSection, RemarksSection, RemindersSection } from './WorkspaceSections'
import {
  type SessionDuty,
  type SessionLink,
  type SessionReminder,
  type SessionRemark,
} from '../../../services/education'

/**
 * VENIO-43 — Fiche séance enrichie.
 *
 * Le compte-rendu reste central. Sous le recap, des sections repliables
 * permettent de capturer rapidement notes libres, remarques datées, liens
 * utiles, rappels et devoirs à donner. Ces enrichissements sont persistés
 * sur la séance via PUT /sessions/:id/workspace et sont donc accessibles
 * depuis n'importe quelle entrée (cockpit, calendrier, classe).
 *
 * Le drawer est volontairement plat (pas d'onglets) : on scroll. Chaque
 * section sauvegarde en autopilote (debounce 800ms) et affiche l'état
 * "Sauvegarde…/Sauvegardé/Erreur" partagé en haut.
 *
 * VENIO-44 — Les sections de workspace (Notes/Devoirs/Rappels/Remarques/
 * Liens) sont désormais dans WorkspaceSections.tsx pour être réutilisées
 * par la fiche d'événement Apple Calendar.
 */

export function SessionDetailDrawer({
  sessionId,
  templates,
  onClose: onExit,
  onChanged,
}: {
  sessionId: string
  /** Templates tous kinds, pour le mode séance et l'enchaînement post-séance. */
  templates?: EducationTemplate[]
  onClose: () => void
  onChanged: () => void
}) {
  const [session, setSession] = useState<EducationSession | null>(null)
  const { stage, restore, flush, status: recapSaveStatus, error: recapSaveError } = useEducationAutosave()
  const onClose = useCallback(async () => {
    if (await flush()) {
      onChanged()
      onExit()
    }
  }, [flush, onChanged, onExit])
  function changeRecap(value: string) {
    setRecap(value)
    stage('session', sessionId, { recap: value })
  }

  const [recap, setRecap] = useState('')
  const [notes, setNotes] = useState('')
  const [remarks, setRemarks] = useState<SessionRemark[]>([])
  const [links, setLinks] = useState<SessionLink[]>([])
  const [reminders, setReminders] = useState<SessionReminder[]>([])
  const [duties, setDuties] = useState<SessionDuty[]>([])
  const [status, setStatus] = useState<EducationSessionStatus>('PLANIFIEE')
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  const [liveOpen, setLiveOpen] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  // Mini-bannière + modale d'enchaînement post-séance (passage en TERMINEE).
  const [postBanner, setPostBanner] = useState(false)
  const [postFlowOpen, setPostFlowOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const r = await getSession(sessionId)
      setSession(r.session)
      const restored = restore('session', sessionId, r.session)
      setRecap(restored.recap || '')
      setNotes(restored.notes || '')
      setRemarks(restored.remarks || [])
      setLinks(restored.links || [])
      setReminders(restored.reminders || [])
      setDuties(restored.duties || [])
      setStatus(r.session.status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la séance')
    }
  }, [sessionId, restore])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (!session) {
    return (
      <WorkspaceOverlayPortal>
        <div className="edu-drawer-backdrop" onClick={onClose} />
        <div className="edu-drawer">
          <div className="edu-drawer-head">
            <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
              Séance
            </h2>
            <button className="edu-btn-icon" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <div className="edu-drawer-body">
            {error ? (
              <div className="edu-banner-error" role="alert">
                {error}
              </div>
            ) : (
              <p className="edu-sub">Chargement…</p>
            )}
          </div>
        </div>
      </WorkspaceOverlayPortal>
    )
  }

  const attendanceFilled = session.attendance.filter((a) => a.state !== 'NON_RENSEIGNE').length

  async function saveStatus(next: EducationSessionStatus) {
    if (!(await flush())) return
    setStatus(next)
    setSaveState('saving')
    try {
      await updateSession(session!._id, { status: next })
      setSaveState('saved')
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
      if (next === 'TERMINEE') setPostBanner(true)
      onChanged()
    } catch (err) {
      setSaveState('error')
      setError(err instanceof Error ? err.message : 'Erreur de sauvegarde du statut')
    }
  }

  return (
    <WorkspaceOverlayPortal>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <div>
            <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
              {session.title}
            </h2>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{formatDate(session.date, true)}</div>
          </div>
          <div className="edu-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button
              className="edu-btn"
              onClick={async () => {
                if (await flush()) setLiveOpen(true)
              }}
              title="Ouvrir le mode séance (présence un-tap)"
            >
              <Play size={14} /> Mode séance
            </button>
            <select
              className="edu-select"
              style={{ width: 'auto' }}
              value={status}
              onChange={(e) => saveStatus(e.target.value as EducationSessionStatus)}
            >
              {Object.entries(SESSION_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button className="edu-btn-icon" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="edu-drawer-body">
          {error && (
            <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
              {error}
              <button
                className="edu-btn ghost"
                style={{ marginLeft: 12 }}
                onClick={() => {
                  setError(null)
                  refresh()
                }}
              >
                Recharger
              </button>
            </div>
          )}

          {postBanner && (
            <div className="edu-postflow-banner" role="status">
              <span style={{ flex: 1 }}>Lancer l'enchaînement post-séance ?</span>
              <button
                className="edu-btn"
                onClick={() => {
                  setPostBanner(false)
                  setPostFlowOpen(true)
                }}
              >
                Lancer
              </button>
              <button className="edu-btn ghost" onClick={() => setPostBanner(false)}>
                Ignorer
              </button>
            </div>
          )}

          <AutosaveStatus status={recapSaveStatus} error={recapSaveError} onRetry={flush} />
          <h2 className="edu-h2">Compte-rendu de séance</h2>
          <textarea
            className="edu-textarea"
            value={recap}
            onChange={(e) => changeRecap(e.target.value)}
            placeholder="Ce qui s'est passé, ce qu'il faut retenir, les points clés pour la prochaine séance…"
            style={{ minHeight: 200 }}
            aria-label="Compte-rendu de séance"
          />
          <EducationAiDraftPanel
            mode="session_synthesis"
            initialText={recap}
            onApply={(draft) => {
              const proposedRecap = draft.fields.recap
              if (typeof proposedRecap === 'string') changeRecap(proposedRecap)
            }}
          />

          <NotesSection
            notes={notes}
            onChange={(value) => {
              setNotes(value)
              stage('session', sessionId, { notes: value })
            }}
          />
          <DutiesSection
            duties={duties}
            onChange={(value) => {
              setDuties(value)
              stage('session', sessionId, { duties: value })
            }}
          />
          <RemindersSection
            reminders={reminders}
            onChange={(value) => {
              setReminders(value)
              stage('session', sessionId, { reminders: value })
            }}
          />
          <RemarksSection
            remarks={remarks}
            onChange={(value) => {
              setRemarks(value)
              stage('session', sessionId, { remarks: value })
            }}
          />
          <LinksSection
            links={links}
            onChange={(value) => {
              setLinks(value)
              stage('session', sessionId, { links: value })
            }}
          />

          {/* Présence en note légère, repliable (inchangé) */}
          <button
            type="button"
            className="edu-collapse-toggle"
            onClick={() => setAttendanceOpen((v) => !v)}
            aria-expanded={attendanceOpen}
          >
            {attendanceOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Présence (note légère)</span>
            <span className="edu-side-badge">
              {attendanceFilled} / {session.attendance.length}
            </span>
          </button>
          {attendanceOpen && (
            <div style={{ marginTop: 10 }}>
              <p className="edu-sub" style={{ marginBottom: 8 }}>
                Optionnel — pour ton propre suivi pédagogique. Ce n'est pas un bloc administratif.
              </p>
              {session.attendance.length === 0 ? (
                <div className="edu-empty">Aucun étudiant inscrit dans la classe.</div>
              ) : (
                <table className="edu-table">
                  <thead>
                    <tr>
                      <th>Étudiant</th>
                      <th>État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.attendance.map((a) => {
                      const stu = typeof a.studentId === 'string' ? null : a.studentId
                      const studentId = typeof a.studentId === 'string' ? a.studentId : a.studentId._id
                      return (
                        <tr key={studentId}>
                          <td>{stu ? studentDisplayName(stu) : '—'}</td>
                          <td>
                            <select
                              className="edu-select"
                              style={{ width: 'auto', borderColor: ATTENDANCE_COLOR[a.state] }}
                              value={a.state}
                              onChange={async (e) => {
                                setSaveState('saving')
                                try {
                                  await updateAttendance(session._id, [
                                    { studentId, state: e.target.value as AttendanceState },
                                  ])
                                  await refresh()
                                  setSaveState('saved')
                                  setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
                                } catch (err) {
                                  setSaveState('error')
                                  setError(err instanceof Error ? err.message : 'Erreur de sauvegarde de la présence')
                                }
                              }}
                            >
                              {Object.entries(ATTENDANCE_LABEL).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Supports de séance (documents uploadés) */}
          <h2 className="edu-h2" style={{ marginTop: 18 }}>
            Supports
          </h2>
          <DocumentsPanel parentType="session" parentId={session._id} />
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
      {liveOpen && (
        <SessionLiveMode
          sessionId={session._id}
          templates={templates}
          onClose={() => {
            setLiveOpen(false)
            refresh()
          }}
          onChanged={onChanged}
        />
      )}
      {postFlowOpen && (
        <PostSessionFlow
          session={{ ...session, recap }}
          templates={templates ?? []}
          onClose={() => {
            setPostFlowOpen(false)
            refresh()
          }}
          onChanged={onChanged}
        />
      )}
    </WorkspaceOverlayPortal>
  )
}
