import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Users, CheckCheck, Flag } from 'lucide-react'
import {
  ATTENDANCE_COLOR,
  ATTENDANCE_LABEL,
  formatDate,
  getSession,
  nextAttendanceState,
  studentDisplayName,
  updateAttendance,
  updateSession,
  type AttendanceEntry,
  type AttendanceState,
  type EducationSession,
  type EducationTemplate,
} from '../../../services/education'
import { PostSessionFlow } from './PostSessionFlow'
import './SessionLiveMode.css'

/**
 * Mode Séance live — présence en un tap pendant le cours.
 *
 * Overlay plein écran (z-index 1100, au-dessus du drawer). Chaque tap sur une
 * carte étudiant fait avancer le cycle de présence (optimiste + rollback).
 * Recap autosavé en débounce, chrono de séance dans le header.
 */
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function attendanceStudentId(a: AttendanceEntry): string {
  return typeof a.studentId === 'string' ? a.studentId : a.studentId._id
}

export function SessionLiveMode({
  sessionId,
  templates,
  onClose,
  onChanged,
}: {
  sessionId: string
  /** Templates tous kinds, pour l'enchaînement post-séance. */
  templates?: EducationTemplate[]
  onClose: () => void
  onChanged: () => void
}) {
  const [session, setSession] = useState<EducationSession | null>(null)
  const [recap, setRecap] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [ending, setEnding] = useState(false)
  const [postFlowOpen, setPostFlowOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await getSession(sessionId)
      let s = r.session
      // Démarrage auto : une séance planifiée ouverte en live passe EN_COURS.
      if (s.status === 'PLANIFIEE') {
        try {
          const u = await updateSession(s._id, { status: 'EN_COURS' })
          s = u.session
          onChanged()
        } catch {
          /* non bloquant — on garde la séance chargée */
        }
      }
      setSession(s)
      setRecap(s.recap || '')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la séance')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    load()
  }, [load])

  // Chrono : tick toutes les 30 s.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  // Escape ferme (sauf focus dans la textarea de recap, ou flow post-séance ouvert).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (postFlowOpen) return
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, postFlowOpen])

  // Autosave debouncé du recap (même pattern que SessionDetailDrawer).
  useEffect(() => {
    if (!session) return
    if (recap === (session.recap || '')) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      try {
        await updateSession(session._id, { recap })
        setSession((s) => (s ? { ...s, recap } : s))
        setSaveState('saved')
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
      } catch (err) {
        setSaveState('error')
        setError(err instanceof Error ? err.message : 'Erreur de sauvegarde du compte-rendu')
      }
    }, 800)
    return () => clearTimeout(t)
  }, [recap, session])

  const counters = useMemo(() => {
    const att = session?.attendance ?? []
    return {
      present: att.filter((a) => a.state === 'PRESENT').length,
      absent: att.filter((a) => a.state === 'ABSENT').length,
      late: att.filter((a) => a.state === 'RETARD').length,
      total: att.length,
    }
  }, [session])

  // Durée restante : date de début + durée − maintenant.
  const chrono = useMemo(() => {
    if (!session) return null
    const end = new Date(session.date).getTime() + session.durationMin * 60_000
    const diffMin = Math.round((end - now) / 60_000)
    const abs = Math.abs(diffMin)
    const h = Math.floor(abs / 60)
    const m = abs % 60
    const fmt = h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`
    return diffMin >= 0 ? `${fmt} restantes` : `dépassé de ${fmt}`
  }, [session, now])

  /** Applique localement un nouvel état de présence (optimiste). */
  function setLocalAttendance(updates: Array<{ studentId: string; state: AttendanceState }>) {
    setSession((s) => {
      if (!s) return s
      const map = new Map(updates.map((u) => [u.studentId, u.state]))
      return {
        ...s,
        attendance: s.attendance.map((a) => {
          const next = map.get(attendanceStudentId(a))
          return next ? { ...a, state: next } : a
        }),
      }
    })
  }

  async function tapStudent(a: AttendanceEntry) {
    if (!session) return
    const studentId = attendanceStudentId(a)
    const prev = a.state
    const next = nextAttendanceState(prev)
    setLocalAttendance([{ studentId, state: next }])
    try {
      await updateAttendance(session._id, [{ studentId, state: next }])
      onChanged()
    } catch (err) {
      // Rollback + bannière.
      setLocalAttendance([{ studentId, state: prev }])
      setError(err instanceof Error ? err.message : 'Erreur de mise à jour de la présence')
    }
  }

  async function markAllPresent() {
    if (!session) return
    const entries = session.attendance
      .filter((a) => a.state === 'NON_RENSEIGNE')
      .map((a) => ({ studentId: attendanceStudentId(a), state: 'PRESENT' as AttendanceState }))
    if (entries.length === 0) return
    setLocalAttendance(entries)
    try {
      await updateAttendance(session._id, entries)
      onChanged()
    } catch (err) {
      setLocalAttendance(entries.map((e) => ({ studentId: e.studentId, state: 'NON_RENSEIGNE' as AttendanceState })))
      setError(err instanceof Error ? err.message : 'Erreur de mise à jour de la présence')
    }
  }

  async function endSession() {
    if (!session) return
    setEnding(true)
    try {
      await updateSession(session._id, { status: 'TERMINEE' })
      setSession((s) => (s ? { ...s, status: 'TERMINEE' } : s))
      onChanged()
      // Enchaînement post-séance au lieu de fermer ; sa fermeture appelle onClose.
      setPostFlowOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de terminer la séance')
    } finally {
      setEnding(false)
    }
  }

  if (!session) {
    return (
      <div className="edu-live-overlay" role="dialog" aria-label="Mode séance">
        {error ? (
          <div className="edu-banner-error" style={{ margin: 24 }} role="alert">
            {error}
            <button
              className="edu-btn ghost"
              style={{ marginLeft: 12 }}
              onClick={() => {
                setError(null)
                load()
              }}
            >
              Réessayer
            </button>
            <button className="edu-btn ghost" onClick={onClose}>
              Fermer
            </button>
          </div>
        ) : (
          <div className="edu-live-loading">Chargement…</div>
        )}
      </div>
    )
  }

  const cls = typeof session.classId === 'string' ? null : session.classId
  const remaining = session.attendance.filter((a) => a.state === 'NON_RENSEIGNE').length

  return (
    <div className="edu-live-overlay" role="dialog" aria-label="Mode séance">
      <div className="edu-live-head">
        <div className="edu-live-head-info">
          <h2 className="edu-live-title">{session.title}</h2>
          <div className="edu-live-subtitle">
            {cls && (
              <span className="edu-pill">
                <span className="edu-pill-dot" style={{ background: cls.color || '#22C55E' }} />
                {cls.name}
              </span>
            )}
            <span>{formatDate(session.date, true)}</span>
            {chrono && <span className="edu-live-chrono">{chrono}</span>}
          </div>
        </div>
        <div className="edu-live-head-actions">
          <span className="edu-live-counters" title="Présents · absents · retards / total">
            <Users size={14} /> présents {counters.present} · absents {counters.absent} · retard {counters.late} /{' '}
            {counters.total}
          </span>
          <SaveIndicator state={saveState} />
          <button className="edu-btn-icon" onClick={onClose} title="Fermer (Esc)">
            <X size={18} />
          </button>
        </div>
      </div>

      {error && (
        <div className="edu-banner-error" style={{ margin: '0 20px 10px' }} role="alert">
          {error}
          <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={() => setError(null)}>
            Fermer
          </button>
        </div>
      )}

      <div className="edu-live-body">
        <div className="edu-row between" style={{ marginBottom: 12 }}>
          <strong>Présence — tape sur une carte pour changer l'état</strong>
          <button className="edu-btn ghost" onClick={markAllPresent} disabled={remaining === 0}>
            <CheckCheck size={14} /> Tous présents{remaining > 0 ? ` (${remaining})` : ''}
          </button>
        </div>

        {session.attendance.length === 0 ? (
          <div className="edu-empty">Aucun étudiant inscrit dans la classe.</div>
        ) : (
          <div className="edu-live-grid">
            {session.attendance.map((a) => {
              const stu = typeof a.studentId === 'string' ? null : a.studentId
              return (
                <button
                  key={attendanceStudentId(a)}
                  type="button"
                  className={`edu-live-card${a.state === 'NON_RENSEIGNE' ? ' pending' : ''}`}
                  style={{ borderColor: ATTENDANCE_COLOR[a.state] }}
                  onClick={() => tapStudent(a)}
                >
                  <span className="edu-live-card-name">{stu ? studentDisplayName(stu) : '—'}</span>
                  <span className="edu-live-card-state" style={{ color: ATTENDANCE_COLOR[a.state] }}>
                    {ATTENDANCE_LABEL[a.state]}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <h2 className="edu-h2" style={{ marginTop: 24 }}>
          Compte-rendu de séance
        </h2>
        <textarea
          className="edu-textarea"
          value={recap}
          onChange={(e) => setRecap(e.target.value)}
          placeholder="Notes à chaud : ce qui s'est passé, points clés, à reprendre la prochaine fois…"
          style={{ minHeight: 140, width: '100%' }}
          aria-label="Compte-rendu de séance"
        />
      </div>

      <div className="edu-live-foot">
        <button className="edu-btn ghost" onClick={onClose}>
          Fermer
        </button>
        <button className="edu-btn" disabled={ending || session.status === 'TERMINEE'} onClick={endSession}>
          <Flag size={14} /> {ending ? 'Clôture…' : 'Terminer la séance'}
        </button>
      </div>

      {postFlowOpen && (
        <PostSessionFlow session={session} templates={templates ?? []} onClose={onClose} onChanged={onChanged} />
      )}
    </div>
  )
}

/* Dupliqué de SessionDetailDrawer (composant volontairement local). */
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
