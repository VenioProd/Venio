import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  X, ChevronDown, ChevronRight, Plus, Trash2, ExternalLink,
  StickyNote, MessageSquare, Link as LinkIcon, BellRing, ClipboardList,
} from 'lucide-react'
import {
  ATTENDANCE_COLOR,
  ATTENDANCE_LABEL,
  SESSION_STATUS_LABEL,
  formatDate,
  getSession,
  studentDisplayName,
  updateAttendance,
  updateSession,
  updateSessionWorkspace,
  type AttendanceState,
  type EducationSession,
  type EducationSessionStatus,
  type SessionDuty,
  type SessionLink,
  type SessionReminder,
  type SessionRemark,
  type SessionWorkspacePayload,
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
 */
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function makeShortId(): string {
  return Math.random().toString(36).slice(2, 10)
}

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
  const [notes, setNotes] = useState('')
  const [remarks, setRemarks] = useState<SessionRemark[]>([])
  const [links, setLinks] = useState<SessionLink[]>([])
  const [reminders, setReminders] = useState<SessionReminder[]>([])
  const [duties, setDuties] = useState<SessionDuty[]>([])
  const [status, setStatus] = useState<EducationSessionStatus>('PLANIFIEE')
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)

  const lastWorkspaceSent = useRef<string>('')

  const refresh = useCallback(async () => {
    try {
      const r = await getSession(sessionId)
      setSession(r.session)
      setRecap(r.session.recap || '')
      setNotes(r.session.notes || '')
      setRemarks(r.session.remarks || [])
      setLinks(r.session.links || [])
      setReminders(r.session.reminders || [])
      setDuties(r.session.duties || [])
      setStatus(r.session.status)
      lastWorkspaceSent.current = JSON.stringify({
        notes: r.session.notes || '',
        remarks: r.session.remarks || [],
        links: r.session.links || [],
        reminders: r.session.reminders || [],
        duties: r.session.duties || [],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la séance')
    }
  }, [sessionId])

  useEffect(() => { refresh() }, [refresh])

  // Autosave du recap (compatibilité avec l'existant — utilise PATCH /:id).
  useEffect(() => {
    if (!session) return
    if (recap === (session.recap || '')) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      try {
        await updateSession(session._id, { recap })
        setSaveState('saved')
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
      } catch (err) {
        setSaveState('error')
        setError(err instanceof Error ? err.message : 'Erreur de sauvegarde')
      }
    }, 800)
    return () => clearTimeout(t)
  }, [recap, session])

  // Autosave consolidée du workspace (notes/remarques/liens/rappels/devoirs).
  // On compare la sérialisation pour éviter une boucle de re-fetch.
  useEffect(() => {
    if (!session) return
    const snapshot: SessionWorkspacePayload = { notes, remarks, links, reminders, duties }
    const serialized = JSON.stringify(snapshot)
    if (serialized === lastWorkspaceSent.current) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      try {
        const r = await updateSessionWorkspace(session._id, snapshot)
        lastWorkspaceSent.current = JSON.stringify({
          notes: r.session.notes || '',
          remarks: r.session.remarks || [],
          links: r.session.links || [],
          reminders: r.session.reminders || [],
          duties: r.session.duties || [],
        })
        // Re-synchroniser les ids générés côté serveur.
        setRemarks(r.session.remarks || [])
        setLinks(r.session.links || [])
        setReminders(r.session.reminders || [])
        setDuties(r.session.duties || [])
        setSaveState('saved')
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
        onChanged()
      } catch (err) {
        setSaveState('error')
        setError(err instanceof Error ? err.message : 'Erreur de sauvegarde')
      }
    }, 800)
    return () => clearTimeout(t)
  }, [notes, remarks, links, reminders, duties, session, onChanged])

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

          <NotesSection notes={notes} onChange={setNotes} />
          <DutiesSection duties={duties} onChange={setDuties} />
          <RemindersSection reminders={reminders} onChange={setReminders} />
          <RemarksSection remarks={remarks} onChange={setRemarks} />
          <LinksSection links={links} onChange={setLinks} />

          {/* Présence en note légère, repliable (inchangé) */}
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

/* ─── Section : Notes libres ─────────────────────────────────────────── */
function NotesSection({ notes, onChange }: { notes: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState<boolean>(() => Boolean(notes))
  useEffect(() => { if (notes) setOpen(true) }, [notes])
  return (
    <div className="edu-session-block">
      <button
        type="button"
        className="edu-collapse-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <StickyNote size={13} />
        <span>Notes libres</span>
        {notes.trim() && <span className="edu-side-badge">{notes.trim().length} car.</span>}
      </button>
      {open && (
        <textarea
          className="edu-textarea"
          style={{ minHeight: 120, marginTop: 8 }}
          value={notes}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Tout ce qui n'a pas sa place dans le recap : idées, brouillons, contexte…"
          aria-label="Notes libres"
        />
      )}
    </div>
  )
}

/* ─── Section : Devoirs à donner ─────────────────────────────────────── */
function DutiesSection({ duties, onChange }: { duties: SessionDuty[]; onChange: (v: SessionDuty[]) => void }) {
  const total = duties.length
  const open = total > 0 ? duties.filter((d) => !d.done).length : 0
  const [expanded, setExpanded] = useState<boolean>(true)
  return (
    <div className="edu-session-block">
      <button
        type="button"
        className="edu-collapse-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <ClipboardList size={13} />
        <span>Devoirs à donner</span>
        {total > 0 && <span className="edu-side-badge">{open} / {total}</span>}
      </button>
      {expanded && (
        <div className="edu-session-block-body">
          {duties.map((d, i) => (
            <div key={d.id} className="edu-session-row">
              <input
                type="checkbox"
                checked={d.done}
                onChange={(e) => {
                  const next = duties.slice()
                  next[i] = { ...d, done: e.target.checked }
                  onChange(next)
                }}
              />
              <input
                className="edu-input"
                value={d.label}
                placeholder="Ex. Lire le chapitre 4 pour la prochaine séance"
                onChange={(e) => {
                  const next = duties.slice()
                  next[i] = { ...d, label: e.target.value }
                  onChange(next)
                }}
                style={{ flex: 1, textDecoration: d.done ? 'line-through' : 'none', opacity: d.done ? 0.6 : 1 }}
              />
              <input
                type="date"
                className="edu-input"
                value={d.dueAt ? d.dueAt.slice(0, 10) : ''}
                onChange={(e) => {
                  const next = duties.slice()
                  next[i] = { ...d, dueAt: e.target.value ? new Date(e.target.value).toISOString() : null }
                  onChange(next)
                }}
                style={{ width: 150 }}
                aria-label="Échéance"
              />
              <button
                type="button"
                className="edu-btn-icon"
                onClick={() => onChange(duties.filter((_, j) => j !== i))}
                aria-label="Supprimer le devoir"
                title="Supprimer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="edu-btn ghost"
            style={{ marginTop: 4 }}
            onClick={() => onChange([...duties, { id: makeShortId(), label: '', dueAt: null, done: false }])}
          >
            <Plus size={13} /> Ajouter un devoir
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Section : Rappels ──────────────────────────────────────────────── */
function RemindersSection({ reminders, onChange }: { reminders: SessionReminder[]; onChange: (v: SessionReminder[]) => void }) {
  const total = reminders.length
  const open = total > 0 ? reminders.filter((r) => !r.done).length : 0
  const [expanded, setExpanded] = useState<boolean>(true)
  return (
    <div className="edu-session-block">
      <button
        type="button"
        className="edu-collapse-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <BellRing size={13} />
        <span>Rappels</span>
        {total > 0 && <span className="edu-side-badge">{open} / {total}</span>}
      </button>
      {expanded && (
        <div className="edu-session-block-body">
          {reminders.map((r, i) => (
            <div key={r.id} className="edu-session-row">
              <input
                type="checkbox"
                checked={r.done}
                onChange={(e) => {
                  const next = reminders.slice()
                  next[i] = { ...r, done: e.target.checked }
                  onChange(next)
                }}
              />
              <input
                className="edu-input"
                value={r.label}
                placeholder="Ex. Préparer le support pour la prochaine séance"
                onChange={(e) => {
                  const next = reminders.slice()
                  next[i] = { ...r, label: e.target.value }
                  onChange(next)
                }}
                style={{ flex: 1, textDecoration: r.done ? 'line-through' : 'none', opacity: r.done ? 0.6 : 1 }}
              />
              <input
                type="date"
                className="edu-input"
                value={r.dueAt ? r.dueAt.slice(0, 10) : ''}
                onChange={(e) => {
                  const next = reminders.slice()
                  next[i] = { ...r, dueAt: e.target.value ? new Date(e.target.value).toISOString() : null }
                  onChange(next)
                }}
                style={{ width: 150 }}
                aria-label="Échéance"
              />
              <button
                type="button"
                className="edu-btn-icon"
                onClick={() => onChange(reminders.filter((_, j) => j !== i))}
                aria-label="Supprimer le rappel"
                title="Supprimer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="edu-btn ghost"
            style={{ marginTop: 4 }}
            onClick={() => onChange([...reminders, { id: makeShortId(), label: '', dueAt: null, done: false }])}
          >
            <Plus size={13} /> Ajouter un rappel
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Section : Remarques datées ─────────────────────────────────────── */
function RemarksSection({ remarks, onChange }: { remarks: SessionRemark[]; onChange: (v: SessionRemark[]) => void }) {
  const [draft, setDraft] = useState('')
  const [expanded, setExpanded] = useState<boolean>(true)
  const sorted = useMemo(() => {
    return [...remarks].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  }, [remarks])
  function addRemark() {
    const text = draft.trim()
    if (!text) return
    onChange([...remarks, { id: makeShortId(), text, createdAt: new Date().toISOString() }])
    setDraft('')
  }
  return (
    <div className="edu-session-block">
      <button
        type="button"
        className="edu-collapse-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <MessageSquare size={13} />
        <span>Remarques</span>
        {remarks.length > 0 && <span className="edu-side-badge">{remarks.length}</span>}
      </button>
      {expanded && (
        <div className="edu-session-block-body">
          <div className="edu-row" style={{ gap: 6 }}>
            <input
              className="edu-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRemark() } }}
              placeholder="Une observation rapide sur la séance, un point d'attention…"
              style={{ flex: 1 }}
            />
            <button type="button" className="edu-btn" onClick={addRemark} disabled={!draft.trim()}>
              <Plus size={13} /> Ajouter
            </button>
          </div>
          {sorted.length === 0 ? (
            <p className="edu-sub" style={{ marginTop: 6 }}>Aucune remarque pour le moment.</p>
          ) : (
            <ul className="edu-session-remarks">
              {sorted.map((r) => (
                <li key={r.id} className="edu-session-remark">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{r.text}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                      {formatDate(r.createdAt, true)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="edu-btn-icon"
                    onClick={() => onChange(remarks.filter((x) => x.id !== r.id))}
                    aria-label="Supprimer la remarque"
                    title="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Section : Liens ────────────────────────────────────────────────── */
function LinksSection({ links, onChange }: { links: SessionLink[]; onChange: (v: SessionLink[]) => void }) {
  const [expanded, setExpanded] = useState<boolean>(true)
  return (
    <div className="edu-session-block">
      <button
        type="button"
        className="edu-collapse-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <LinkIcon size={13} />
        <span>Liens</span>
        {links.length > 0 && <span className="edu-side-badge">{links.length}</span>}
      </button>
      {expanded && (
        <div className="edu-session-block-body">
          {links.map((l, i) => (
            <div key={l.id} className="edu-session-row">
              <input
                className="edu-input"
                value={l.label}
                placeholder="Libellé (Slides, Drive, vidéo…)"
                onChange={(e) => {
                  const next = links.slice()
                  next[i] = { ...l, label: e.target.value }
                  onChange(next)
                }}
                style={{ flex: 1 }}
              />
              <input
                className="edu-input"
                value={l.url}
                placeholder="https://…"
                onChange={(e) => {
                  const next = links.slice()
                  next[i] = { ...l, url: e.target.value }
                  onChange(next)
                }}
                style={{ flex: 2 }}
              />
              {l.url && (
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="edu-btn-icon"
                  aria-label="Ouvrir le lien"
                  title="Ouvrir"
                >
                  <ExternalLink size={14} />
                </a>
              )}
              <button
                type="button"
                className="edu-btn-icon"
                onClick={() => onChange(links.filter((_, j) => j !== i))}
                aria-label="Supprimer le lien"
                title="Supprimer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="edu-btn ghost"
            style={{ marginTop: 4 }}
            onClick={() => onChange([...links, { id: makeShortId(), label: '', url: '' }])}
          >
            <Plus size={13} /> Ajouter un lien
          </button>
        </div>
      )}
    </div>
  )
}
