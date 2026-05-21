import { useCallback, useEffect, useState } from 'react'
import { Apple, CalendarDays, Clock, ExternalLink, MapPin, Plus, RefreshCw } from 'lucide-react'
import {
  formatDate,
  formatRelative,
  ASSIGNMENT_KIND_LABEL,
  ASSIGNMENT_STATUS_COLOR,
  ASSIGNMENT_STATUS_LABEL,
  SESSION_STATUS_LABEL,
  type EducationDashboard,
} from '../../../services/education'
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
  onCreateClass,
  onOpenCalendar,
  reloadError,
  onReload,
}: {
  dashboard: EducationDashboard | null
  selectedSchool: string
  onChangeSchool: (school: string) => void
  onOpenClass: (id: string) => void
  onCreateClass: () => void
  onOpenCalendar?: () => void
  reloadError: string | null
  onReload: () => void
}) {
  if (!dashboard) {
    return (
      <div>
        {reloadError ? (
          <div className="edu-banner-error" role="alert">
            {reloadError}
            <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={onReload}>Réessayer</button>
          </div>
        ) : (
          <p className="edu-sub">Chargement…</p>
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
          <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={onReload}>Réessayer</button>
        </div>
      )}

      <div className="edu-row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="edu-h1">Cockpit intervenant</h1>
          <p className="edu-sub">Ton point d'entrée quotidien — aujourd'hui, cette semaine et ce qui attend ton attention.</p>
        </div>
        <div className="edu-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {schoolsToShow.length > 0 && (
            <select
              className="edu-select"
              style={{ width: 'auto', minWidth: 180 }}
              value={selectedSchool}
              onChange={(e) => onChangeSchool(e.target.value)}
              aria-label="Filtrer par école"
            >
              <option value="">Toutes les écoles</option>
              {schoolsToShow.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button className="edu-btn" onClick={onCreateClass}><Plus size={14} /> Nouvelle classe</button>
        </div>
      </div>

      <div className="edu-kpi-grid">
        <Kpi label="Classes actives" value={c.activeClasses} />
        <Kpi label="Étudiants suivis" value={c.totalStudents} />
        <Kpi label="Aujourd'hui" value={c.todaySessions} sub="séance(s)" />
        <Kpi label="Cette semaine" value={c.weekSessions} sub="séance(s)" />
        <Kpi label="À préparer" value={c.toPrepare} sub="prochaines 72 h" />
        <Kpi label="À corriger" value={c.toGrade} sub={c.lateSubmissions > 0 ? `${c.lateSubmissions} en retard` : undefined} />
      </div>

      {/* Prochains cours (calendrier Apple) — VENIO-42 */}
      <UpcomingCalendarSection
        onOpenClass={onOpenClass}
        onOpenCalendar={onOpenCalendar}
      />

      {/* Aujourd'hui */}
      <Section title="Aujourd'hui">
        {dashboard.today.length === 0 ? (
          <p className="edu-empty">Pas de séance aujourd'hui.</p>
        ) : (
          <table className="edu-table">
            <thead>
              <tr><th>Heure</th><th>Classe</th><th>École</th><th>Séance</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {dashboard.today.map((s) => {
                const cls = typeof s.classId === 'string' ? null : s.classId
                const school = (cls as { school?: string } | null)?.school
                return (
                  <tr key={s._id} onClick={() => cls?._id && onOpenClass(cls._id)} style={{ cursor: 'pointer' }}>
                    <td>{new Date(s.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{cls && <span className="edu-pill"><span className="edu-pill-dot" style={{ background: cls.color || '#22C55E' }} />{cls.name}</span>}</td>
                    <td>{school || '—'}</td>
                    <td>{s.title}</td>
                    <td><span className="edu-pill">{SESSION_STATUS_LABEL[s.status]}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Cette semaine */}
      <Section title="Cette semaine">
        {dashboard.week.length === 0 ? (
          <p className="edu-empty">Pas de séance planifiée cette semaine.</p>
        ) : (
          <table className="edu-table">
            <thead>
              <tr><th>Date</th><th>Classe</th><th>École</th><th>Séance</th></tr>
            </thead>
            <tbody>
              {dashboard.week.map((s) => {
                const cls = typeof s.classId === 'string' ? null : s.classId
                const school = (cls as { school?: string } | null)?.school
                return (
                  <tr key={s._id} onClick={() => cls?._id && onOpenClass(cls._id)} style={{ cursor: 'pointer' }}>
                    <td>{formatDate(s.date, true)}</td>
                    <td>{cls && <span className="edu-pill"><span className="edu-pill-dot" style={{ background: cls.color || '#22C55E' }} />{cls.name}</span>}</td>
                    <td>{school || '—'}</td>
                    <td>{s.title}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* À préparer */}
      <Section title="À préparer" subtitle="Séances planifiées dans les 72h prochaines">
        {dashboard.toPrepare.length === 0 ? (
          <p className="edu-empty">Rien à préparer dans l'immédiat.</p>
        ) : (
          <table className="edu-table">
            <thead>
              <tr><th>Quand</th><th>Classe</th><th>Séance</th><th>Lieu</th></tr>
            </thead>
            <tbody>
              {dashboard.toPrepare.map((s) => {
                const cls = typeof s.classId === 'string' ? null : s.classId
                return (
                  <tr key={s._id} onClick={() => cls?._id && onOpenClass(cls._id)} style={{ cursor: 'pointer' }}>
                    <td>{formatDate(s.date, true)}</td>
                    <td>{cls && <span className="edu-pill"><span className="edu-pill-dot" style={{ background: cls.color || '#22C55E' }} />{cls.name}</span>}</td>
                    <td>{s.title}{s.theme && <span style={{ color: 'rgba(255,255,255,0.5)' }}> · {s.theme}</span>}</td>
                    <td>{s.location || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* À corriger */}
      <Section title="À corriger" subtitle={c.toGrade > 0 ? `${c.toGrade} copie(s) en attente` : 'Aucune correction en attente'}>
        {dashboard.toCorrect.length === 0 ? (
          <p className="edu-empty">Aucun devoir ouvert pour le moment.</p>
        ) : (
          <table className="edu-table">
            <thead>
              <tr><th>Devoir</th><th>Classe</th><th>Type</th><th>Échéance</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {dashboard.toCorrect.map((a) => {
                const cls = typeof a.classId === 'string' ? null : a.classId
                return (
                  <tr key={a._id} onClick={() => cls?._id && onOpenClass(cls._id)} style={{ cursor: 'pointer' }}>
                    <td>{a.title}</td>
                    <td>{cls && <span className="edu-pill"><span className="edu-pill-dot" style={{ background: cls.color || '#22C55E' }} />{cls.name}</span>}</td>
                    <td>{ASSIGNMENT_KIND_LABEL[a.kind]}</td>
                    <td>{a.deadline ? formatDate(a.deadline) : '—'}</td>
                    <td>
                      <span className="edu-pill"><span className="edu-pill-dot" style={{ background: ASSIGNMENT_STATUS_COLOR[a.status] }} />{ASSIGNMENT_STATUS_LABEL[a.status]}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Dernière séance par classe */}
      <Section title="Dernière séance par classe" subtitle="Rappel rapide : où on en est dans chaque classe.">
        {dashboard.lastSessionByClass.length === 0 ? (
          <p className="edu-empty">Aucune classe active.</p>
        ) : (
          <table className="edu-table">
            <thead>
              <tr><th>Classe</th><th>École</th><th>Dernière séance</th><th>Quand</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {dashboard.lastSessionByClass.map((row) => (
                <tr
                  key={row.class._id}
                  onClick={() => onOpenClass(row.class._id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td><span className="edu-pill"><span className="edu-pill-dot" style={{ background: row.class.color || '#22C55E' }} />{row.class.name}</span></td>
                  <td>{row.class.school || '—'}</td>
                  <td>{row.lastSession ? row.lastSession.title : <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>}</td>
                  <td>{row.lastSession ? formatRelative(row.lastSession.date) : <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>}</td>
                  <td>{row.lastSession ? <span className="edu-pill">{SESSION_STATUS_LABEL[row.lastSession.status]}</span> : <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Points d'attention pédagogiques (devoirs en retard) */}
      {c.lateSubmissions > 0 && (
        <Section title="Points d'attention pédagogiques" subtitle="Devoirs rendus en retard à corriger en priorité.">
          <p className="edu-sub">
            {c.lateSubmissions} soumission{c.lateSubmissions > 1 ? 's' : ''} en retard à examiner.
          </p>
        </Section>
      )}

      <Section title="Activité récente">
        {dashboard.activity.length === 0 ? (
          <p className="edu-empty">—</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {dashboard.activity.slice(0, 10).map((a) => (
              <li key={a._id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{formatRelative(a.createdAt)}</span>
                {' · '}
                <span>{a.action.toLowerCase()} {a.entityType}</span>
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
      {subtitle && <p className="edu-sub" style={{ marginBottom: 12 }}>{subtitle}</p>}
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
  onOpenClass,
  onOpenCalendar,
}: {
  onOpenClass: (id: string) => void
  onOpenCalendar?: () => void
}) {
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
        setError(e.message || 'Impossible de charger le calendrier.')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <section className="edu-cockpit-cal">
      <div className="edu-cockpit-cal-head">
        <div>
          <h2 className="edu-h2" style={{ marginBottom: 4 }}>
            <CalendarDays size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Prochains cours
          </h2>
          <p className="edu-sub" style={{ marginBottom: 0 }}>
            Calendrier Apple — 14 prochains jours, lecture seule.
            {payload?.fetchedAt && (
              <> · Sync : <strong style={{ color: 'rgba(255,255,255,0.75)' }}>{formatRelative(payload.fetchedAt)}</strong>
                {payload.fromCache && <span style={{ marginLeft: 6, opacity: 0.65 }}>(cache)</span>}
              </>
            )}
          </p>
        </div>
        <div className="edu-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button
            className="edu-btn ghost"
            onClick={() => load({ silent: true })}
            disabled={refreshing || loading}
            title="Rafraîchir depuis le cache serveur"
          >
            <RefreshCw size={13} className={refreshing ? 'edu-spin' : ''} /> Rafraîchir
          </button>
          {onOpenCalendar && (
            <button className="edu-btn ghost" onClick={onOpenCalendar} title="Ouvrir la vue Calendrier complète">
              <Apple size={13} /> Voir le calendrier
            </button>
          )}
        </div>
      </div>

      {unconfigured && (
        <div className="edu-cockpit-cal-state" role="alert">
          <span className="edu-cockpit-cal-state-icon" aria-hidden>📅</span>
          <div>
            <div style={{ fontWeight: 600 }}>Calendrier Apple non configuré.</div>
            <div style={{ opacity: 0.75, fontSize: 13 }}>
              Définir <code>EDUCATION_APPLE_CALENDAR_ICS_URL</code> côté serveur pour activer ce bloc.
            </div>
          </div>
        </div>
      )}

      {error && !unconfigured && (
        <div className="edu-cockpit-cal-state edu-cockpit-cal-state-error" role="alert">
          <span className="edu-cockpit-cal-state-icon" aria-hidden>!</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Erreur de chargement</div>
            <div style={{ opacity: 0.85, fontSize: 13 }}>{error}</div>
          </div>
          <button className="edu-btn ghost" onClick={() => load()}>Réessayer</button>
        </div>
      )}

      {loading && !payload && !error && !unconfigured && (
        <div className="edu-cockpit-cal-state" aria-busy="true">
          Chargement du calendrier…
        </div>
      )}

      {payload && !unconfigured && !error && (
        <UpcomingList
          events={payload.events}
          onOpenClass={onOpenClass}
          onOpenCalendar={onOpenCalendar}
        />
      )}
    </section>
  )
}

function UpcomingList({
  events,
  onOpenClass,
  onOpenCalendar,
}: {
  events: UpcomingCalendarEvent[]
  onOpenClass: (id: string) => void
  onOpenCalendar?: () => void
}) {
  const now = Date.now()
  const upcoming = events
    .filter((ev) => new Date(ev.end).getTime() >= now)
    .slice(0, 8)

  if (upcoming.length === 0) {
    return (
      <p className="edu-empty">
        Pas de cours dans le calendrier sur les 14 prochains jours.
      </p>
    )
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
}: {
  event: UpcomingCalendarEvent
  onOpenClass: (id: string) => void
  onOpenCalendar?: () => void
}) {
  const start = new Date(event.start)
  const end = new Date(event.end)
  const matchColor = event.match?.color || '#0EA5E9'
  const matchLabel = event.match?.className
  const schoolBadge = event.match?.school || event.school

  function handleOpen() {
    if (event.match?.classId) {
      onOpenClass(event.match.classId)
    } else if (onOpenCalendar) {
      onOpenCalendar()
    }
  }

  const actionLabel = event.match ? 'Ouvrir la classe' : 'Voir le calendrier'

  return (
    <div className="edu-cockpit-cal-item" style={{ borderLeftColor: matchColor }}>
      <div className="edu-cockpit-cal-item-main">
        <div className="edu-cockpit-cal-item-time">
          <Clock size={12} />
          {event.allDay
            ? 'Journée entière'
            : `${start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
        </div>
        <div className="edu-cockpit-cal-item-title">{event.title}</div>
        <div className="edu-cockpit-cal-item-meta">
          {matchLabel ? (
            <span
              className="edu-pill"
              title={`Classe rattachée (${event.match?.reason === 'exact-name' ? 'nom exact' : 'tokens'})`}
            >
              <span className="edu-pill-dot" style={{ background: matchColor }} />
              {matchLabel}
            </span>
          ) : (
            <span className="edu-cockpit-cal-item-loose">Non rattaché</span>
          )}
          {schoolBadge && <span className="edu-cockpit-cal-school">{schoolBadge}</span>}
          {event.location && (
            <span className="edu-cockpit-cal-item-loc">
              <MapPin size={11} /> {event.location}
            </span>
          )}
          <span className="edu-cockpit-cal-source" title="Source : Apple Calendar (lecture seule)">
            <Apple size={11} /> Apple
          </span>
        </div>
      </div>
      <button
        type="button"
        className="edu-btn ghost edu-cockpit-cal-item-action"
        onClick={handleOpen}
        aria-label={actionLabel}
      >
        {event.match ? <ExternalLink size={13} /> : <CalendarDays size={13} />}
        <span className="edu-cockpit-cal-item-action-label">{actionLabel}</span>
      </button>
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
  if (isSameDay(d, today)) return 'Aujourd’hui'
  if (isSameDay(d, tomorrow)) return 'Demain'
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'short' })
}
