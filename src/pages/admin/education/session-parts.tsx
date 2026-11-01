import PageHeader from '../../../components/admin/ui/PageHeader'
/**
 * Composants internes extraits de `education/index.tsx` pour passer sous 800 lignes.
 *
 * NOTE : ce fichier dépasse lui-même 800 lignes (issue de découpage à faire dans
 * un follow-up — voir issue #87). Un découpage par domaine (classes/students/
 * sessions/assignments/notes) est suggéré pour atteindre le DOD strict.
 */
import { useCallback, useEffect, useState } from 'react'
import { Plus, X, ChevronRight } from 'lucide-react'
import {
  listSessions,
  createSession,
  SESSION_STATUS_LABEL,
  type EducationClass,
  type EducationSession,
  type EducationTemplate,
} from '../../../services/education'
import { SessionDetailDrawer } from './SessionDetailDrawer'
import { EducationAiDraftPanel } from './EducationAiDraft'
import { SessionLiveMode } from './SessionLiveMode'
import { NoteEditor } from './NoteEditor'
import { CorrectionMode } from './CorrectionMode'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { formatShortDate as formatDate } from './eduFormat'

export type NoteSaveState = 'idle' | 'saving' | 'saved' | 'error'
export type ClassTab = 'overview' | 'students' | 'sessions' | 'assignments' | 'notes'

/** Vrai si la date tombe aujourd'hui (heure locale). */
function isToday(date: string): boolean {
  const d = new Date(date)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

export function SessionsTab({
  classId,
  onChanged,
  templates,
}: {
  classId: string
  onChanged: () => void
  /** Templates tous kinds : filtrés localement pour le form, transmis entiers au drawer. */
  templates?: EducationTemplate[]
}) {
  const { t } = useI18n()
  const [sessions, setSessions] = useState<EducationSession[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const r = await listSessions({ classId })
    setSessions(r.sessions)
  }, [classId])
  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div>
      <div className="edu-row between" style={{ marginBottom: 12 }}>
        <strong>{t('eduB.sessionsList.count', { count: sessions.length })}</strong>
        <button className="edu-btn" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> {t('eduB.sessionsList.newSession')}
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="edu-empty">{t('eduB.sessionsList.empty')}</div>
      ) : (
        <table className="edu-table">
          <thead>
            <tr>
              <th>{t('eduB.cols.date')}</th>
              <th>{t('eduB.cols.session')}</th>
              <th>{t('eduB.cols.status')}</th>
              <th>{t('eduB.cols.attendance')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const present = s.attendance.filter((a) => a.state === 'PRESENT').length
              const total = s.attendance.length
              return (
                <tr key={s._id} onClick={() => setOpenSessionId(s._id)} style={{ cursor: 'pointer' }}>
                  <td>{formatDate(s.date, true)}</td>
                  <td>
                    <strong>{s.title}</strong>
                    {s.theme && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{s.theme}</div>}
                  </td>
                  <td>
                    <span className="edu-pill">{SESSION_STATUS_LABEL[s.status]}</span>
                  </td>
                  <td>
                    {present} / {total}
                  </td>
                  <td>
                    <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {showCreate && (
        <SessionForm
          classId={classId}
          templates={templates?.filter((t) => t.kind === 'session')}
          onClose={() => setShowCreate(false)}
          onSaved={async () => {
            setShowCreate(false)
            await refresh()
            onChanged()
          }}
        />
      )}
      {openSessionId && (
        <SessionDetailDrawer
          sessionId={openSessionId}
          templates={templates}
          onClose={() => setOpenSessionId(null)}
          onChanged={async () => {
            await refresh()
            onChanged()
          }}
        />
      )}
    </div>
  )
}

export function SessionForm({
  classId,
  classes,
  templates,
  defaultDate,
  onClose,
  onSaved,
}: {
  /** Si absent, un select de classe obligatoire est affiché (utiliser `classes`). */
  classId?: string
  classes?: EducationClass[]
  /** Templates kind="session", filtrés par l'appelant. */
  templates?: EducationTemplate[]
  /** Date initiale au format datetime-local (ex. enchaînement post-séance : +7 jours). */
  defaultDate?: string
  onClose: () => void
  /** Reçoit la séance créée (utilisé par PostSessionFlow pour l'afficher). */
  onSaved: (created?: EducationSession) => void
}) {
  const { t } = useI18n()
  const [classChoice, setClassChoice] = useState(classId ?? '')
  const [templateId, setTemplateId] = useState('')
  const [form, setForm] = useState({
    title: '',
    theme: '',
    date: defaultDate ?? new Date().toISOString().slice(0, 16),
    durationMin: 120,
    location: '',
    agenda: '',
    objectives: [] as string[],
    supports: [] as string[],
  })
  const [saving, setSaving] = useState(false)

  // Pré-remplit le form depuis template.body (champs reconnus, le reste ignoré).
  function applyTemplate(id: string) {
    setTemplateId(id)
    const t = templates?.find((x) => x._id === id)
    if (!t) return
    const b = t.body as Record<string, unknown>
    setForm((f) => ({
      ...f,
      title: typeof b.title === 'string' ? b.title : f.title,
      theme: typeof b.theme === 'string' ? b.theme : f.theme,
      agenda: typeof b.agenda === 'string' ? b.agenda : f.agenda,
      durationMin: typeof b.durationMin === 'number' ? b.durationMin : f.durationMin,
      location: typeof b.location === 'string' ? b.location : f.location,
      supports: Array.isArray(b.supports) ? b.supports.filter((v): v is string => typeof v === 'string') : f.supports,
      objectives: Array.isArray(b.objectives)
        ? (b.objectives as unknown[]).filter((o): o is string => typeof o === 'string')
        : f.objectives,
    }))
  }

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer" style={{ width: 'min(560px, 92vw)' }}>
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
            {t('eduB.sessionsList.newSession')}
          </h2>
          <button className="edu-btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="edu-drawer-body">
          {templates && templates.length > 0 && (
            <div className="edu-form-group">
              <label>{t('eduB.sessionForm.fromTemplate')}</label>
              <select className="edu-select" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">{t('eduB.sessionForm.none')}</option>
                {templates.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!classId && (
            <div className="edu-form-group">
              <label>{t('eduB.createSession.classLabel')}</label>
              <select className="edu-select" value={classChoice} onChange={(e) => setClassChoice(e.target.value)}>
                <option value="">{t('eduB.createSession.classPlaceholder')}</option>
                {(classes ?? []).map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="edu-form-group">
            <label>{t('eduB.createSession.titleLabel')}</label>
            <input
              className="edu-input"
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>{t('eduB.createSession.dateLabel')}</label>
              <input
                type="datetime-local"
                className="edu-input"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="edu-form-group">
              <label>{t('eduB.createSession.durationLabel')}</label>
              <input
                type="number"
                className="edu-input"
                value={form.durationMin}
                onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="edu-form-group">
            <label>{t('eduB.sessionForm.theme')}</label>
            <input
              className="edu-input"
              value={form.theme}
              onChange={(e) => setForm({ ...form, theme: e.target.value })}
            />
          </div>
          <EducationAiDraftPanel
            mode="session_plan"
            onApply={(draft) => {
              const fields = draft.fields
              setForm((current) => ({
                ...current,
                title: typeof fields.title === 'string' ? fields.title : current.title,
                theme: typeof fields.theme === 'string' ? fields.theme : current.theme,
                agenda: typeof fields.agenda === 'string' ? fields.agenda : current.agenda,
                objectives: Array.isArray(fields.objectives) ? fields.objectives : current.objectives,
                durationMin:
                  typeof fields.durationMin === 'string'
                    ? Number(fields.durationMin) || current.durationMin
                    : current.durationMin,
              }))
            }}
          />
          <div className="edu-form-group">
            <label>{t('eduB.createSession.locationLabel')}</label>
            <input
              className="edu-input"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <div className="edu-form-group">
            <label>{t('eduB.sessionForm.agenda')}</label>
            <textarea
              className="edu-textarea"
              value={form.agenda}
              onChange={(e) => setForm({ ...form, agenda: e.target.value })}
            />
          </div>
          {form.objectives.length > 0 && (
            <p className="edu-sub" style={{ marginTop: 4 }}>
              {t('eduB.sessionForm.objectives', { list: form.objectives.join(' · ') })}
            </p>
          )}
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="edu-btn"
            disabled={!form.title.trim() || !form.date || !classChoice || saving}
            onClick={async () => {
              setSaving(true)
              try {
                const r = await createSession({
                  classId: classChoice,
                  title: form.title,
                  theme: form.theme,
                  date: new Date(form.date).toISOString(),
                  durationMin: form.durationMin,
                  location: form.location,
                  agenda: form.agenda,
                  objectives: form.objectives,
                })
                onSaved(r.session)
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? t('eduB.createSession.creating') : t('eduB.createSession.title')}
          </button>
        </div>
      </div>
    </>
  )
}

/* SessionDetailDrawer extrait dans ./SessionDetailDrawer.tsx (VENIO-27).
   - Recap central, autosave visible ("Sauvegarde…/Sauvegardé/Erreur").
   - Présence repositionnée en note légère repliable, non centrale. */

/* ─── Assignments tab (kanban) ─────────────────────────────────────────── */

export function SessionsView({
  classes,
  incomingOpenId,
  onCloseIncomingOpen,
  templates,
}: {
  classes: EducationClass[]
  incomingOpenId?: string | null
  onCloseIncomingOpen?: () => void
  /** Templates tous kinds : filtrés localement pour le form, transmis entiers au drawer/live. */
  templates?: EducationTemplate[]
}) {
  const { t } = useI18n()
  const [filterClass, setFilterClass] = useState<string>('')
  const [items, setItems] = useState<EducationSession[]>([])
  const [error, setError] = useState<string | null>(null)
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  const [liveId, setLiveId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const refreshSessions = useCallback(() => {
    listSessions(filterClass ? { classId: filterClass } : {})
      .then((r) => {
        setItems(r.sessions)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : translate('eduB.sessionsView.loadFailed')))
  }, [filterClass])

  useEffect(() => {
    refreshSessions()
  }, [refreshSessions])

  useEffect(() => {
    if (incomingOpenId) {
      setOpenSessionId(incomingOpenId)
      onCloseIncomingOpen?.()
    }
  }, [incomingOpenId, onCloseIncomingOpen])

  return (
    <>
      <div>
        <div className="edu-row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <PageHeader
            eyebrow={t('adminOps.zone.education')}
            title={t('eduB.sessionsView.title')}
            actions={
              <>
                <div className="edu-row" style={{ gap: 8 }}>
                  <select
                    className="edu-select"
                    style={{ width: 220 }}
                    value={filterClass}
                    onChange={(e) => setFilterClass(e.target.value)}
                  >
                    <option value="">{t('eduB.sessionsView.allClasses')}</option>
                    {classes.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button className="edu-btn" onClick={() => setShowCreate(true)}>
                    <Plus size={14} /> {t('eduB.sessionsList.newSession')}
                  </button>
                </div>
              </>
            }
          />
        </div>
        {error && (
          <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}
        <p className="edu-sub">{t('eduB.sessionsList.count', { count: items.length })}</p>
        {items.length === 0 ? (
          <div className="edu-empty">
            <div className="edu-empty-icon">📅</div>
            <div>{filterClass ? t('eduB.sessionsView.emptyForClass') : t('eduB.sessionsView.emptyAll')}</div>
            <div className="edu-empty-sub">{t('eduB.sessionsView.emptySub')}</div>
          </div>
        ) : (
          <table className="edu-table">
            <thead>
              <tr>
                <th>{t('eduB.cols.date')}</th>
                <th>{t('eduB.cols.class')}</th>
                <th>{t('eduB.cols.session')}</th>
                <th>{t('eduB.cols.status')}</th>
                <th>{t('eduB.cols.attendance')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => {
                const cls = typeof s.classId === 'string' ? null : s.classId
                const present = s.attendance.filter((a) => a.state === 'PRESENT').length
                const liveable = isToday(s.date) && s.status !== 'TERMINEE' && s.status !== 'ANNULEE'
                return (
                  <tr key={s._id} onClick={() => setOpenSessionId(s._id)} style={{ cursor: 'pointer' }}>
                    <td>{formatDate(s.date, true)}</td>
                    <td>
                      {cls && (
                        <span className="edu-pill">
                          <span className="edu-pill-dot" style={{ background: cls.color || 'var(--good)' }} />
                          {cls.name}
                        </span>
                      )}
                    </td>
                    <td>{s.title}</td>
                    <td>
                      <span className="edu-pill">{SESSION_STATUS_LABEL[s.status]}</span>
                    </td>
                    <td>
                      {present} / {s.attendance.length}
                    </td>
                    <td>
                      {liveable && (
                        <button
                          className="edu-btn"
                          title={t('eduB.sessionDrawer.liveModeTitle')}
                          onClick={(e) => {
                            e.stopPropagation()
                            setLiveId(s._id)
                          }}
                        >
                          {t('eduB.sessionsView.live')}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {showCreate && (
        <SessionForm
          classId={filterClass || undefined}
          classes={classes}
          templates={templates?.filter((t) => t.kind === 'session')}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false)
            refreshSessions()
          }}
        />
      )}
      {openSessionId && (
        <SessionDetailDrawer
          sessionId={openSessionId}
          templates={templates}
          onClose={() => setOpenSessionId(null)}
          onChanged={refreshSessions}
        />
      )}
      {liveId && (
        <SessionLiveMode
          sessionId={liveId}
          templates={templates}
          onClose={() => {
            setLiveId(null)
            refreshSessions()
          }}
          onChanged={refreshSessions}
        />
      )}
    </>
  )
}

/* ─── Assignments standalone view ──────────────────────────────────────── */
