import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown, ChevronRight, Plus, Trash2, ExternalLink,
  StickyNote, MessageSquare, Link as LinkIcon, BellRing, ClipboardList,
} from 'lucide-react'
import {
  formatDate,
  type SessionDuty,
  type SessionLink,
  type SessionReminder,
  type SessionRemark,
} from '../../../services/education'

/**
 * VENIO-44 — Sections de "workspace" pédagogique partagées entre :
 *   - la fiche séance interne (SessionDetailDrawer, VENIO-43),
 *   - la fiche d'événement Apple Calendar (CalendarEventWorkspaceDrawer).
 *
 * Mêmes blocs, mêmes UX (autosave géré par le parent), mêmes types côté
 * client (Session* réutilisés). Ce fichier ne fait JAMAIS d'appel API ;
 * il est purement présentationnel + callbacks onChange.
 */

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function makeShortId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function SaveIndicator({ state }: { state: SaveState }) {
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
export function NotesSection({ notes, onChange }: { notes: string; onChange: (v: string) => void }) {
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
export function DutiesSection({ duties, onChange }: { duties: SessionDuty[]; onChange: (v: SessionDuty[]) => void }) {
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
export function RemindersSection({ reminders, onChange }: { reminders: SessionReminder[]; onChange: (v: SessionReminder[]) => void }) {
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
export function RemarksSection({ remarks, onChange }: { remarks: SessionRemark[]; onChange: (v: SessionRemark[]) => void }) {
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
export function LinksSection({ links, onChange }: { links: SessionLink[]; onChange: (v: SessionLink[]) => void }) {
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
