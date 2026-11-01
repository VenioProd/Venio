import PageHeader from '../../../components/admin/ui/PageHeader'
import { useCallback, useEffect, useState } from 'react'
import { Apple, CalendarDays, Clock, ExternalLink, MapPin, Plus, RefreshCw, StickyNote } from 'lucide-react'
import {
  ASSIGNMENT_KIND_LABEL,
  ASSIGNMENT_STATUS_COLOR,
  ASSIGNMENT_STATUS_LABEL,
  SESSION_STATUS_LABEL,
  type EducationDashboard,
  type EducationDashboardAlert,
} from '../../../services/education'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { formatDate as formatIntlDate } from '../../../i18n/format'
import { EducationAiDraftPanel } from './EducationAiDraft'
import { formatRelativeDate as formatRelative, formatShortDate as formatDate } from './eduFormat'
import { formatClock, formatRange, messageWithNode } from './calendarFormat'
import {
  fetchUpcomingCalendar,
  type UpcomingCalendarEvent,
  type UpcomingCalendarPayload,
} from '../../../services/educationCalendar'

/**
 * VENIO-27 — Cockpit intervenant multi-écoles.
 * Sections : Aujourd'hui · Cette semaine · À préparer · À corriger ·
 * Dernière séance par classe. Filtre école multi-écoles.
 * Vocabulaire neutre : "points d'attention pédagogiques" (pas de risque/alerte).
 *
 * VENIO-42 — bloc "Prochains cours" connecté au calendrier Apple :
 * lecture seule, rapprochement best-effort avec les EducationClass quand
 * possible. Permet d'ouvrir la classe rattachée ou de basculer sur la vue
 * Calendrier sans quitter le cockpit.
 */
export function DashboardView({
  dashboard,
  selectedSchool,
  onChangeSchool,
  onOpenClass,
  onOpenStudent,
  onOpenSession,
  onStartLive,
  onStartCorrection,
  onOpenCalendarEvent,
  onCreateClass,
  onOpenCalendar,
  reloadError,
  onReload,
}: {
  dashboard: EducationDashboard | null
  selectedSchool: string
  onChangeSchool: (school: string) => void
  onOpenClass: (id: string) => void
  onOpenSession: (id: string) => void
  onStartLive: (id: string) => void
  onStartCorrection: (id: string) => void
  onOpenStudent: (alert: EducationDashboardAlert) => void
  onOpenCalendarEvent?: (event: UpcomingCalendarEvent) => void
  onCreateClass: () => void
  onOpenCalendar?: () => void
  reloadError: string | null
  onReload: () => void
}) {
  const { t } = useI18n()
  const [checklist, setChecklist] = useState('')
  if (!dashboard) {
    return (
      <div>
        {reloadError ? (
          <div className="edu-banner-error" role="alert">
            {reloadError}
            <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={onReload}>
              {t('eduB.shared.retry')}
            </button>
          </div>
        ) : (
          <p className="edu-sub">{t('eduB.shared.loading')}</p>
        )}
      </div>
    )
  }

  const c = dashboard.counters
  const schoolsToShow = dashboard.schools.length > 0 ? dashboard.schools : []

  return (
    <div>
      {reloadError && (
        <div className="edu-banner-error" role="alert" style={{ marginBottom: 16 }}>
          {reloadError}
          <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={onReload}>
            {t('eduB.shared.retry')}
          </button>
        </div>
      )}

      <div className="edu-row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <PageHeader
          eyebrow={t('adminOps.zone.education')}
          title={t('eduB.dashboard.title')}
          subtitle={<>{t('eduB.dashboard.subtitle')}</>}
          actions={
            <>
              <div className="edu-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {schoolsToShow.length > 0 && (
                  <select
                    className="edu-select"
                    style={{ width: 'auto', minWidth: 180 }}
                    value={selectedSchool}
                    onChange={(e) => onChangeSchool(e.target.value)}
                    aria-label={t('eduB.dashboard.filterSchool')}
                  >
                    <option value="">{t('eduB.dashboard.allSchools')}</option>
                    {schoolsToShow.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
                <button className="edu-btn" onClick={onCreateClass}>
                  <Plus size={14} /> {t('eduB.dashboard.newClass')}
                </button>
              </div>
            </>
          }
        />
      </div>

      <div className="edu-kpi-grid">
        <Kpi label={t('eduB.dashboard.kpiActiveClasses')} value={c.activeClasses} />
        <Kpi label={t('eduB.dashboard.kpiStudents')} value={c.totalStudents} />
        <Kpi label={t('eduB.dashboard.today')} value={c.todaySessions} sub={t('eduB.dashboard.kpiSessionsSub')} />
        <Kpi label={t('eduB.dashboard.thisWeek')} value={c.weekSessions} sub={t('eduB.dashboard.kpiSessionsSub')} />
        <Kpi label={t('eduB.dashboard.toPrepare')} value={c.toPrepare} sub={t('eduB.dashboard.kpiNext72')} />
        <Kpi
          label={t('eduB.dashboard.toGrade')}
          value={c.toGrade}
          sub={c.lateSubmissions > 0 ? t('eduB.dashboard.kpiLate', { count: c.lateSubmissions }) : undefined}
        />
      </div>

      <EducationAiDraftPanel
        mode="checklist_action_plan"
        onApply={(draft) => {
          const items = draft.fields.checklist
          if (Array.isArray(items)) setChecklist(items.map((item) => `- [ ] ${item}`).join('\n'))
        }}
      />
      {checklist && (
        <div className="edu-form-group" style={{ marginBottom: 20 }}>
          <label>{t('eduB.dashboard.checklistLabel')}</label>
          <textarea className="edu-textarea" value={checklist} onChange={(event) => setChecklist(event.target.value)} />
        </div>
      )}
      {/* Prochains cours (calendrier Apple) — VENIO-42 + VENIO-44 */}
      <UpcomingCalendarSection
        selectedSchool={selectedSchool}
        onOpenClass={onOpenClass}
        onOpenCalendar={onOpenCalendar}
        onOpenCalendarEvent={onOpenCalendarEvent}
      />

      {/* Aujourd'hui */}
      <Section title={t('eduB.dashboard.today')}>
        {dashboard.today.length === 0 ? (
          <p className="edu-empty">{t('eduB.dashboard.todayEmpty')}</p>
        ) : (
          <table className="edu-table">
            <thead>
              <tr>
                <th>{t('eduB.cols.time')}</th>
                <th>{t('eduB.cols.class')}</th>
                <th>{t('eduB.cols.school')}</th>
                <th>{t('eduB.cols.session')}</th>
                <th>{t('eduB.cols.status')}</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.today.map((s) => {
                const cls = typeof s.classId === 'string' ? null : s.classId
                const school = (cls as { school?: string } | null)?.school
                return (
                  <tr key={s._id}>
                    <td>{formatClock(s.date)}</td>
                    <td>
                      {cls && (
                        <button
                          type="button"
                          className="edu-btn ghost"
                          onClick={() => onOpenClass(cls._id)}
                          aria-label={t('eduB.dashboard.openClass', { name: cls.name })}
                        >
                          <span className="edu-pill-dot" style={{ background: cls.color || 'var(--good)' }} />
                          {cls.name}
                        </button>
                      )}
                    </td>
                    <td>{school || '—'}</td>
                    <td>
                      <button className="edu-btn ghost" onClick={() => onOpenSession(s._id)}>
                        {s.title}
                      </button>
                    </td>
                    <td>
                      <span className="edu-pill">{SESSION_STATUS_LABEL[s.status]}</span>
                      {['PLANIFIEE', 'EN_COURS'].includes(s.status) && (
                        <button
                          className="edu-btn ghost"
                          onClick={() => onStartLive(s._id)}
                          aria-label={t('eduB.dashboard.startSession', { title: s.title })}
                        >
                          {t('eduB.dashboard.live')}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Cette semaine */}
      <Section title={t('eduB.dashboard.thisWeek')}>
        {dashboard.week.length === 0 ? (
          <p className="edu-empty">{t('eduB.dashboard.weekEmpty')}</p>
        ) : (
          <table className="edu-table">
            <thead>
              <tr>
                <th>{t('eduB.cols.date')}</th>
                <th>{t('eduB.cols.class')}</th>
                <th>{t('eduB.cols.school')}</th>
                <th>{t('eduB.cols.session')}</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.week.map((s) => {
                const cls = typeof s.classId === 'string' ? null : s.classId
                const school = (cls as { school?: string } | null)?.school
                return (
                  <tr key={s._id}>
                    <td>{formatDate(s.date, true)}</td>
                    <td>
                      {cls && (
                        <button
                          type="button"
                          className="edu-btn ghost"
                          onClick={() => onOpenClass(cls._id)}
                          aria-label={t('eduB.dashboard.openClass', { name: cls.name })}
                        >
                          <span className="edu-pill-dot" style={{ background: cls.color || 'var(--good)' }} />
                          {cls.name}
                        </button>
                      )}
                    </td>
                    <td>{school || '—'}</td>
                    <td>
                      <button className="edu-btn ghost" onClick={() => onOpenSession(s._id)}>
                        {s.title}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* À préparer */}
      <Section title={t('eduB.dashboard.toPrepare')} subtitle={t('eduB.dashboard.toPrepareSubtitle')}>
        {dashboard.toPrepare.length === 0 ? (
          <p className="edu-empty">{t('eduB.dashboard.toPrepareEmpty')}</p>
        ) : (
          <table className="edu-table">
            <thead>
              <tr>
                <th>{t('eduB.cols.when')}</th>
                <th>{t('eduB.cols.class')}</th>
                <th>{t('eduB.cols.session')}</th>
                <th>{t('eduB.cols.location')}</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.toPrepare.map((s) => {
                const cls = typeof s.classId === 'string' ? null : s.classId
                return (
                  <tr key={s._id}>
                    <td>{formatDate(s.date, true)}</td>
                    <td>
                      {cls && (
                        <button
                          type="button"
                          className="edu-btn ghost"
                          onClick={() => onOpenClass(cls._id)}
                          aria-label={t('eduB.dashboard.openClass', { name: cls.name })}
                        >
                          <span className="edu-pill-dot" style={{ background: cls.color || 'var(--good)' }} />
                          {cls.name}
                        </button>
                      )}
                    </td>
                    <td>
                      <button className="edu-btn ghost" onClick={() => onOpenSession(s._id)}>
                        {s.title}
                      </button>
                      {s.theme && <span style={{ color: 'var(--text-secondary)' }}> · {s.theme}</span>}
                    </td>
                    <td>{s.location || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* À corriger */}
      <Section
        title={t('eduB.dashboard.toGrade')}
        subtitle={
          c.toGrade > 0 ? t('eduB.dashboard.toGradeSubtitle', { count: c.toGrade }) : t('eduB.dashboard.toGradeNone')
        }
      >
        {dashboard.toCorrect.length === 0 ? (
          <p className="edu-empty">{t('eduB.dashboard.toGradeEmpty')}</p>
        ) : (
          <table className="edu-table">
            <thead>
              <tr>
                <th>{t('eduB.cols.assignment')}</th>
                <th>{t('eduB.cols.class')}</th>
                <th>{t('eduB.cols.type')}</th>
                <th>{t('eduB.cols.due')}</th>
                <th>{t('eduB.cols.status')}</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.toCorrect.map((a) => {
                const cls = typeof a.classId === 'string' ? null : a.classId
                return (
                  <tr key={a._id}>
                    <td>
                      <button
                        className="edu-btn ghost"
                        onClick={() => onStartCorrection(a._id)}
                        aria-label={t('eduB.dashboard.gradeLabel', { title: a.title })}
                      >
                        {t('eduB.dashboard.gradeButton', { title: a.title })}
                      </button>
                    </td>
                    <td>
                      {cls && (
                        <button
                          type="button"
                          className="edu-btn ghost"
                          onClick={() => onOpenClass(cls._id)}
                          aria-label={t('eduB.dashboard.openClass', { name: cls.name })}
                        >
                          <span className="edu-pill-dot" style={{ background: cls.color || 'var(--good)' }} />
                          {cls.name}
                        </button>
                      )}
                    </td>
                    <td>{ASSIGNMENT_KIND_LABEL[a.kind]}</td>
                    <td>{a.deadline ? formatDate(a.deadline) : '—'}</td>
                    <td>
                      <span className="edu-pill">
                        <span className="edu-pill-dot" style={{ background: ASSIGNMENT_STATUS_COLOR[a.status] }} />
                        {ASSIGNMENT_STATUS_LABEL[a.status]}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Dernière séance par classe */}
      <Section title={t('eduB.dashboard.lastByClass')} subtitle={t('eduB.dashboard.lastByClassSubtitle')}>
        {dashboard.lastSessionByClass.length === 0 ? (
          <p className="edu-empty">{t('eduB.dashboard.noActiveClass')}</p>
        ) : (
          <table className="edu-table">
            <thead>
              <tr>
                <th>{t('eduB.cols.class')}</th>
                <th>{t('eduB.cols.school')}</th>
                <th>{t('eduB.cols.lastSession')}</th>
                <th>{t('eduB.cols.when')}</th>
                <th>{t('eduB.cols.status')}</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.lastSessionByClass.map((row) => (
                <tr key={row.class._id}>
                  <td>
                    <button className="edu-btn ghost" onClick={() => onOpenClass(row.class._id)}>
                      <span className="edu-pill-dot" style={{ background: row.class.color || 'var(--good)' }} />
                      {row.class.name}
                    </button>
                  </td>
                  <td>{row.class.school || '—'}</td>
                  <td>
                    {row.lastSession ? (
                      <button className="edu-btn ghost" onClick={() => onOpenSession(row.lastSession!._id)}>
                        {row.lastSession.title}
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {row.lastSession ? (
                      formatRelative(row.lastSession.date)
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {row.lastSession ? (
                      <span className="edu-pill">{SESSION_STATUS_LABEL[row.lastSession.status]}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Points d'attention pédagogiques (devoirs en retard) */}
      {c.lateSubmissions > 0 && (
        <Section title={t('eduB.dashboard.attentionTitle')} subtitle={t('eduB.dashboard.attentionSubtitle')}>
          <p className="edu-sub">{t('eduB.dashboard.lateSubmissions', { count: c.lateSubmissions })}</p>
        </Section>
      )}

      <Section
        title={t('eduB.dashboard.followUp')}
        subtitle={dashboard.alerts.length > 0 ? t('eduB.dashboard.followUpSome') : t('eduB.dashboard.followUpNone')}
      >
        {dashboard.alerts.length > 0 && (
          <div className="edu-alert-list" role="list" aria-label={t('eduB.dashboard.followUpAria')}>
            {dashboard.alerts.map((alert) => (
              <button
                key={`${alert.type}-${alert.student._id}`}
                type="button"
                className="edu-alert-row"
                onClick={() => onOpenStudent(alert)}
                role="listitem"
              >
                <span className={`edu-alert-severity ${alert.severity}`} aria-hidden />
                <span className="edu-alert-main">
                  <strong>
                    {[alert.student.firstName, alert.student.lastName.toUpperCase()].filter(Boolean).join(' ') ||
                      t('eduB.dashboard.unnamedStudent')}
                  </strong>
                  <span>{alert.message}</span>
                </span>
                <span className="edu-alert-class">
                  <span className="edu-pill-dot" style={{ background: alert.class.color || 'var(--good)' }} />
                  {alert.class.name}
                  {alert.class.school ? ` · ${alert.class.school}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title={t('eduB.dashboard.recentActivity')}>
        {dashboard.activity.length === 0 ? (
          <p className="edu-empty">—</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {dashboard.activity.slice(0, 10).map((a) => (
              <li
                key={a._id}
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 5%, transparent)',
                  fontSize: 13,
                }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>{formatRelative(a.createdAt)}</span>
                {' · '}
                <span>
                  {a.action.toLowerCase()} {a.entityType}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="edu-h2">{title}</h2>
      {subtitle && (
        <p className="edu-sub" style={{ marginBottom: 12 }}>
          {subtitle}
        </p>
      )}
      {children}
    </section>
  )
}

function Kpi({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="edu-kpi">
      <div className="edu-kpi-label">{label}</div>
      <div className="edu-kpi-value">{value}</div>
      {sub && <div className="edu-kpi-sub">{sub}</div>}
    </div>
  )
}

// ─── VENIO-42 — Section "Prochains cours" branchée sur le calendrier Apple ─

function UpcomingCalendarSection({
  selectedSchool,
  onOpenClass,
  onOpenCalendar,
  onOpenCalendarEvent,
}: {
  selectedSchool: string
  onOpenClass: (id: string) => void
  onOpenCalendar?: () => void
  onOpenCalendarEvent?: (event: UpcomingCalendarEvent) => void
}) {
  const { t } = useI18n()
  const [payload, setPayload] = useState<UpcomingCalendarPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unconfigured, setUnconfigured] = useState(false)

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true)
    else setRefreshing(true)
    setError(null)
    setUnconfigured(false)
    try {
      const data = await fetchUpcomingCalendar({ days: 14 })
      setPayload(data)
    } catch (err) {
      const e = err as { status?: number; message?: string; data?: { configured?: boolean } }
      if (e.status === 503 || e.data?.configured === false) {
        setUnconfigured(true)
        setPayload(null)
      } else {
        setError(e.message || translate('eduB.upcoming.loadFallback'))
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <section className="edu-cockpit-cal">
      <div className="edu-cockpit-cal-head">
        <div>
          <h2 className="edu-h2" style={{ marginBottom: 4 }}>
            <CalendarDays size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            {t('eduB.upcoming.title')}
          </h2>
          <p className="edu-sub" style={{ marginBottom: 0 }}>
            {t('eduB.upcoming.subtitle')}
            {payload?.fetchedAt && (
              <>
                {' '}
                {messageWithNode(
                  'eduB.upcoming.sync',
                  'when',
                  <strong style={{ color: 'var(--text-secondary)' }}>{formatRelative(payload.fetchedAt)}</strong>,
                )}
                {payload.fromCache && <span style={{ marginLeft: 6, opacity: 0.65 }}>{t('eduB.calendar.cache')}</span>}
              </>
            )}
          </p>
        </div>
        <div className="edu-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button
            className="edu-btn ghost"
            onClick={() => load({ silent: true })}
            disabled={refreshing || loading}
            title={t('eduB.upcoming.refreshTitle')}
          >
            <RefreshCw size={13} className={refreshing ? 'edu-spin' : ''} /> {t('eduB.upcoming.refresh')}
          </button>
          {onOpenCalendar && (
            <button className="edu-btn ghost" onClick={onOpenCalendar} title={t('eduB.upcoming.viewCalendarTitle')}>
              <Apple size={13} /> {t('eduB.upcoming.viewCalendar')}
            </button>
          )}
        </div>
      </div>

      {unconfigured && (
        <div className="edu-cockpit-cal-state" role="alert">
          <span className="edu-cockpit-cal-state-icon" aria-hidden>
            📅
          </span>
          <div>
            <div style={{ fontWeight: 600 }}>{t('eduB.upcoming.unconfigured')}</div>
            <div style={{ opacity: 0.75, fontSize: 13 }}>{t('eduB.upcoming.unconfiguredHint')}</div>
          </div>
        </div>
      )}

      {error && !unconfigured && (
        <div className="edu-cockpit-cal-state edu-cockpit-cal-state-error" role="alert">
          <span className="edu-cockpit-cal-state-icon" aria-hidden>
            !
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{t('eduB.shared.loadErrorTitle')}</div>
            <div style={{ opacity: 0.85, fontSize: 13 }}>{error}</div>
          </div>
          <button className="edu-btn ghost" onClick={() => load()}>
            {t('eduB.shared.retry')}
          </button>
        </div>
      )}

      {loading && !payload && !error && !unconfigured && (
        <div className="edu-cockpit-cal-state" aria-busy="true">
          {t('eduB.calendar.loading')}
        </div>
      )}

      {payload && !unconfigured && !error && (
        <UpcomingList
          events={payload.events.filter(
            (event) => !selectedSchool || (event.match?.school || event.school) === selectedSchool,
          )}
          onOpenClass={onOpenClass}
          onOpenCalendar={onOpenCalendar}
          onOpenCalendarEvent={onOpenCalendarEvent}
        />
      )}
    </section>
  )
}

function UpcomingList({
  events,
  onOpenClass,
  onOpenCalendar,
  onOpenCalendarEvent,
}: {
  events: UpcomingCalendarEvent[]
  onOpenClass: (id: string) => void
  onOpenCalendar?: () => void
  onOpenCalendarEvent?: (event: UpcomingCalendarEvent) => void
}) {
  const { t } = useI18n()
  const now = Date.now()
  const upcoming = events.filter((ev) => new Date(ev.end).getTime() >= now).slice(0, 8)

  if (upcoming.length === 0) {
    return <p className="edu-empty">{t('eduB.upcoming.empty')}</p>
  }

  const byDay = new Map<string, UpcomingCalendarEvent[]>()
  for (const ev of upcoming) {
    const d = new Date(ev.start)
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const list = byDay.get(dayKey) || []
    list.push(ev)
    byDay.set(dayKey, list)
  }

  return (
    <div className="edu-cockpit-cal-list">
      {Array.from(byDay.entries()).map(([key, dayEvents]) => (
        <div key={key} className="edu-cockpit-cal-day">
          <div className="edu-cockpit-cal-day-head">{formatDayLabel(dayEvents[0].start)}</div>
          {dayEvents.map((ev) => (
            <UpcomingItem
              key={ev.occurrenceId}
              event={ev}
              onOpenClass={onOpenClass}
              onOpenCalendar={onOpenCalendar}
              onOpenCalendarEvent={onOpenCalendarEvent}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function UpcomingItem({
  event,
  onOpenClass,
  onOpenCalendar,
  onOpenCalendarEvent,
}: {
  event: UpcomingCalendarEvent
  onOpenClass: (id: string) => void
  onOpenCalendar?: () => void
  onOpenCalendarEvent?: (event: UpcomingCalendarEvent) => void
}) {
  const { t } = useI18n()
  const matchColor = event.match?.color || 'var(--primary)'
  const matchLabel = event.match?.className
  const schoolBadge = event.match?.school || event.school

  // VENIO-44 — Le clic principal ouvre désormais la fiche workspace
  // exploitable (notes, devoirs, rappels…). Si le parent ne l'a pas câblée,
  // on retombe sur l'ancien comportement (classe rattachée puis calendrier).
  function handleOpenWorkspace() {
    if (onOpenCalendarEvent) {
      onOpenCalendarEvent(event)
    } else if (event.match?.classId) {
      onOpenClass(event.match.classId)
    } else if (onOpenCalendar) {
      onOpenCalendar()
    }
  }

  const primaryLabel = onOpenCalendarEvent
    ? t('eduB.upcoming.openSheet')
    : event.match
      ? t('eduB.event.openClass')
      : t('eduB.upcoming.viewCalendar')

  return (
    <div className="edu-cockpit-cal-item" style={{ borderLeftColor: matchColor }}>
      <div className="edu-cockpit-cal-item-main">
        <div className="edu-cockpit-cal-item-time">
          <Clock size={12} />
          {formatRange(event.start, event.end, event.allDay)}
        </div>
        <div className="edu-cockpit-cal-item-title">{event.title}</div>
        <div className="edu-cockpit-cal-item-meta">
          {matchLabel ? (
            <span
              className="edu-pill"
              title={
                event.match?.reason === 'exact-name' ? t('eduB.upcoming.matchExact') : t('eduB.upcoming.matchTokens')
              }
            >
              <span className="edu-pill-dot" style={{ background: matchColor }} />
              {matchLabel}
            </span>
          ) : (
            <span className="edu-cockpit-cal-item-loose">{t('eduB.upcoming.unlinked')}</span>
          )}
          {schoolBadge && <span className="edu-cockpit-cal-school">{schoolBadge}</span>}
          {event.location && (
            <span className="edu-cockpit-cal-item-loc">
              <MapPin size={11} /> {event.location}
            </span>
          )}
          <span className="edu-cockpit-cal-source" title={t('eduB.upcoming.sourceTitle')}>
            <Apple size={11} /> Apple
          </span>
        </div>
      </div>
      <div className="edu-row" style={{ gap: 6 }}>
        {event.match && (
          <button
            type="button"
            className="edu-btn ghost edu-cockpit-cal-item-action"
            onClick={(e) => {
              e.stopPropagation()
              onOpenClass(event.match!.classId)
            }}
            aria-label={t('eduB.event.openClass')}
            title={t('eduB.upcoming.linkedClassTitle')}
          >
            <ExternalLink size={13} />
            <span className="edu-cockpit-cal-item-action-label">{t('eduB.upcoming.classShort')}</span>
          </button>
        )}
        <button
          type="button"
          className="edu-btn ghost edu-cockpit-cal-item-action"
          onClick={(e) => {
            e.stopPropagation()
            handleOpenWorkspace()
          }}
          aria-label={primaryLabel}
        >
          {onOpenCalendarEvent ? (
            <StickyNote size={13} />
          ) : event.match ? (
            <ExternalLink size={13} />
          ) : (
            <CalendarDays size={13} />
          )}
          <span className="edu-cockpit-cal-item-action-label">{primaryLabel}</span>
        </button>
      </div>
    </div>
  )
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (isSameDay(d, today)) return translate('eduB.upcoming.todayLabel')
  if (isSameDay(d, tomorrow)) return translate('eduB.upcoming.tomorrow')
  return formatIntlDate(d, { weekday: 'long', day: '2-digit', month: 'short' })
}
