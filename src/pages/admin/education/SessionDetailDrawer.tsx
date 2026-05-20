import { useCallback, useEffect, useState } from 'react'
import { X, ChevronDown, ChevronRight } from 'lucide-react'
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
} from '../../../services/education'

/**
 * VENIO-27 — Détail de séance.
 *
 * Le compte-rendu est central. La présence est repositionnée comme
 * note légère de séance, repliable. Pas d'usage central / bloc admin.
 *
 * Autosave : affiche "Sauvegarde…", "Sauvegardé", "Erreur" pour le recap.
 */
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function SessionDetailDrawer({
  sessionId,
  onClose,
  onChanged,
}: {
  sessionId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [session, setSession] = useState<EducationSession | null>(null)
  const [recap, setRecap] = useState('')
  const [status, setStatus] = useState<EducationSessionStatus>('PLANIFIEE')
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await getSession(sessionId)
      setSession(r.session)
      setRecap(r.session.recap || '')
      setStatus(r.session.status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la séance')
    }
  }, [sessionId])

  useEffect(() => { refresh() }, [refresh])

  // Autosave debouncé du recap.
  useEffect(() => {
    if (!session) return
    if (recap === (session.recap || '')) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      try {
        await updateSession(session._id, { recap })
        setSaveState('saved')
        // Retour à idle après 1.5s.
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
      } catch (err) {
        setSaveState('error')
        setError(err instanceof Error ? err.message : 'Erreur de sauvegarde')
      }
    }, 800)
    return () => clearTimeout(t)
  }, [recap, session])

  if (!session) {
    return (
      <>
        <div className="edu-drawer-backdrop" onClick={onClose} />
        <div className="edu-drawer">
          <div className="edu-drawer-head">
            <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>Séance</h2>
            <button className="edu-btn-icon" onClick={onClose}><X size={18} /></button>
          </div>
          <div className="edu-drawer-body">
            {error ? (
              <div className="edu-banner-error" role="alert">{error}</div>
            ) : (
              <p className="edu-sub">Chargement…</p>
            )}
          </div>
        </div>
      </>
    )
  }

  const attendanceFilled = session.attendance.filter((a) => a.state !== 'NON_RENSEIGNE').length

  async function saveStatus(next: EducationSessionStatus) {
    setStatus(next)
    setSaveState('saving')
    try {
      await updateSession(session!._id, { status: next })
      setSaveState('saved')
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
      onChanged()
    } catch (err) {
      setSaveState('error')
      setError(err instanceof Error ? err.message : 'Erreur de sauvegarde du statut')
    }
  }

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <div>
            <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>{session.title}</h2>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{formatDate(session.date, true)}</div>
          </div>
          <div className="edu-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <SaveIndicator state={saveState} />
            <select
              className="edu-select"
              style={{ width: 'auto' }}
              value={status}
              onChange={(e) => saveStatus(e.target.value as EducationSessionStatus)}
            >
              {Object.entries(SESSION_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="edu-btn-icon" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="edu-drawer-body">
          {error && (
            <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
              {error}
              <button
                className="edu-btn ghost"
                style={{ marginLeft: 12 }}
                onClick={() => { setError(null); refresh() }}
              >
                Recharger
              </button>
            </div>
          )}

          <h2 className="edu-h2">Compte-rendu de séance</h2>
          <textarea
            className="edu-textarea"
            value={recap}
            onChange={(e) => setRecap(e.target.value)}
            placeholder="Ce qui s'est passé, ce qu'il faut retenir, les points clés pour la prochaine séance…"
            style={{ minHeight: 200 }}
            aria-label="Compte-rendu de séance"
          />

          {/* Présence en note légère, repliable */}
          <button
            type="button"
            className="edu-collapse-toggle"
            onClick={() => setAttendanceOpen((v) => !v)}
            aria-expanded={attendanceOpen}
          >
            {attendanceOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Présence (note légère)</span>
            <span className="edu-side-badge">{attendanceFilled} / {session.attendance.length}</span>
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
                  <thead><tr><th>Étudiant</th><th>État</th></tr></thead>
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
                                  await updateAttendance(session._id, [{ studentId, state: e.target.value as AttendanceState }])
                                  await refresh()
                                  setSaveState('saved')
                                  setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
                                } catch (err) {
                                  setSaveState('error')
                                  setError(err instanceof Error ? err.message : 'Erreur de sauvegarde de la présence')
                                }
                              }}
                            >
                              {Object.entries(ATTENDANCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  const label = state === 'saving' ? 'Sauvegarde…' : state === 'saved' ? 'Sauvegardé' : 'Erreur'
  const color = state === 'error' ? '#EF4444' : state === 'saved' ? '#22C55E' : 'rgba(255,255,255,0.6)'
  return (
    <span
      className="edu-pill"
      style={{ background: 'rgba(255,255,255,0.06)', color, fontSize: 11.5 }}
      aria-live="polite"
    >
      {label}
    </span>
  )
}
