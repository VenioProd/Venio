import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  ExternalLink,
  StickyNote,
  MessageSquare,
  Link as LinkIcon,
  BellRing,
  ClipboardList,
} from 'lucide-react'
import {
  type SessionDuty,
  type SessionLink,
  type SessionReminder,
  type SessionRemark,
} from '../../../services/education'
import { useI18n } from '../../../context/I18nContext'
import { formatShortDate } from './eduFormat'

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
  const { t } = useI18n()
  if (state === 'idle') return null
  const label =
    state === 'saving' ? t('eduC.sections.saving') : state === 'saved' ? t('eduC.sections.saved') : t('common.error')
  const color = state === 'error' ? 'var(--critical)' : state === 'saved' ? 'var(--good)' : 'var(--text-secondary)'
  return (
    <span
      className="edu-pill"
      style={{ background: 'color-mix(in srgb, var(--text-primary) 6%, transparent)', color, fontSize: 11.5 }}
      aria-live="polite"
    >
      {label}
    </span>
  )
}

/* ─── Section : Notes libres ─────────────────────────────────────────── */
export function NotesSection({ notes, onChange }: { notes: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState<boolean>(() => Boolean(notes))
  useEffect(() => {
    if (notes) setOpen(true)
  }, [notes])
  return (
    <div className="edu-session-block">
      <button type="button" className="edu-collapse-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <StickyNote size={13} />
        <span>{t('eduC.sections.notes')}</span>
        {notes.trim() && (
          <span className="edu-side-badge">{t('eduC.sections.notesCount', { count: notes.trim().length })}</span>
        )}
      </button>
      {open && (
        <textarea
          className="edu-textarea"
          style={{ minHeight: 120, marginTop: 8 }}
          value={notes}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('eduC.sections.notesPlaceholder')}
          aria-label={t('eduC.sections.notes')}
        />
      )}
    </div>
  )
}

/* ─── Section : Devoirs à donner ─────────────────────────────────────── */
export function DutiesSection({ duties, onChange }: { duties: SessionDuty[]; onChange: (v: SessionDuty[]) => void }) {
  const { t } = useI18n()
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
        <span>{t('eduC.sections.duties')}</span>
        {total > 0 && (
          <span className="edu-side-badge">
            {open} / {total}
          </span>
        )}
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
                placeholder={t('eduC.sections.dutyPlaceholder')}
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
                aria-label={t('eduC.shared.dueDate')}
              />
              <button
                type="button"
                className="edu-btn-icon"
                onClick={() => onChange(duties.filter((_, j) => j !== i))}
                aria-label={t('eduC.sections.removeDuty')}
                title={t('common.delete')}
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
            <Plus size={13} /> {t('eduC.sections.addDuty')}
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Section : Rappels ──────────────────────────────────────────────── */
export function RemindersSection({
  reminders,
  onChange,
}: {
  reminders: SessionReminder[]
  onChange: (v: SessionReminder[]) => void
}) {
  const { t } = useI18n()
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
        <span>{t('eduC.sections.reminders')}</span>
        {total > 0 && (
          <span className="edu-side-badge">
            {open} / {total}
          </span>
        )}
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
                placeholder={t('eduC.sections.reminderPlaceholder')}
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
                aria-label={t('eduC.shared.dueDate')}
              />
              <button
                type="button"
                className="edu-btn-icon"
                onClick={() => onChange(reminders.filter((_, j) => j !== i))}
                aria-label={t('eduC.sections.removeReminder')}
                title={t('common.delete')}
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
            <Plus size={13} /> {t('eduC.sections.addReminder')}
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Section : Remarques datées ─────────────────────────────────────── */
export function RemarksSection({
  remarks,
  onChange,
}: {
  remarks: SessionRemark[]
  onChange: (v: SessionRemark[]) => void
}) {
  const { t } = useI18n()
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
        <span>{t('eduC.sections.remarks')}</span>
        {remarks.length > 0 && <span className="edu-side-badge">{remarks.length}</span>}
      </button>
      {expanded && (
        <div className="edu-session-block-body">
          <div className="edu-row" style={{ gap: 6 }}>
            <input
              className="edu-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addRemark()
                }
              }}
              placeholder={t('eduC.sections.remarkPlaceholder')}
              style={{ flex: 1 }}
            />
            <button type="button" className="edu-btn" onClick={addRemark} disabled={!draft.trim()}>
              <Plus size={13} /> {t('common.add')}
            </button>
          </div>
          {sorted.length === 0 ? (
            <p className="edu-sub" style={{ marginTop: 6 }}>
              {t('eduC.sections.remarksEmpty')}
            </p>
          ) : (
            <ul className="edu-session-remarks">
              {sorted.map((r) => (
                <li key={r.id} className="edu-session-remark">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{r.text}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {formatShortDate(r.createdAt, true)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="edu-btn-icon"
                    onClick={() => onChange(remarks.filter((x) => x.id !== r.id))}
                    aria-label={t('eduC.sections.removeRemark')}
                    title={t('common.delete')}
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
  const { t } = useI18n()
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
        <span>{t('eduC.sections.links')}</span>
        {links.length > 0 && <span className="edu-side-badge">{links.length}</span>}
      </button>
      {expanded && (
        <div className="edu-session-block-body">
          {links.map((l, i) => (
            <div key={l.id} className="edu-session-row">
              <input
                className="edu-input"
                value={l.label}
                placeholder={t('eduC.sections.linkLabelPlaceholder')}
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
                  aria-label={t('eduC.sections.openLink')}
                  title={t('eduC.sections.open')}
                >
                  <ExternalLink size={14} />
                </a>
              )}
              <button
                type="button"
                className="edu-btn-icon"
                onClick={() => onChange(links.filter((_, j) => j !== i))}
                aria-label={t('eduC.sections.removeLink')}
                title={t('common.delete')}
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
            <Plus size={13} /> {t('eduC.sections.addLink')}
          </button>
        </div>
      )}
    </div>
  )
}
