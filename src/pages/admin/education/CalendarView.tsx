import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Apple, MapPin, Clock, AlertTriangle,
} from 'lucide-react'
import {
  fetchAppleCalendar,
  refreshAppleCalendar,
  type AppleCalendarEvent,
  type AppleCalendarPayload,
} from '../../../services/educationCalendar'

type Mode = 'week' | 'month'

const DAY_NAMES_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const DAY_NAMES_LONG = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  const dow = out.getDay() // 0 = dim
  const diff = (dow + 6) % 7 // lundi = 0
  out.setDate(out.getDate() - diff)
  return out
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function formatRange(start: string, end: string, allDay: boolean): string {
  if (allDay) return 'Journée entière'
  return `${formatTime(start)} – ${formatTime(end)}`
}

function durationLabel(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

function eventColor(ev: AppleCalendarEvent): string {
  // Couleur stable par école/classe pour aider Raphael à scanner.
  const key = (ev.school || ev.classLabel || ev.title || ev.uid).toLowerCase()
  const palette = ['#22C55E', '#0EA5E9', '#A855F7', '#F59E0B', '#EC4899', '#14B8A6', '#F97316', '#6366F1']
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

function groupEventsByDay(events: AppleCalendarEvent[]): Map<string, AppleCalendarEvent[]> {
  const map = new Map<string, AppleCalendarEvent[]>()
  for (const ev of events) {
    const key = formatDayKey(new Date(ev.start))
    const list = map.get(key) || []
    list.push(ev)
    map.set(key, list)
  }
  return map
}

export function CalendarView() {
  const [mode, setMode] = useState<Mode>('week')
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [payload, setPayload] = useState<AppleCalendarPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unconfigured, setUnconfigured] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<AppleCalendarEvent | null>(null)

  const { from, to } = useMemo(() => computeRange(mode, anchor), [mode, anchor])

  const load = useCallback(async (opts: { refresh?: boolean } = {}) => {
    if (opts.refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    setUnconfigured(false)
    try {
      const data = await fetchAppleCalendar({ from, to, refresh: opts.refresh })
      setPayload(data)
    } catch (err) {
      const e = err as { status?: number; message?: string; data?: { configured?: boolean } }
      if (e.status === 503 || e.data?.configured === false) {
        setUnconfigured(true)
        setPayload(null)
      } else {
        setError(e.message || 'Impossible de charger le calendrier Apple.')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [from, to])

  useEffect(() => { load() }, [load])

  const eventsByDay = useMemo(() => groupEventsByDay(payload?.events || []), [payload])

  function goPrev() {
    setAnchor((prev) => mode === 'week' ? addDays(prev, -7) : new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }
  function goNext() {
    setAnchor((prev) => mode === 'week' ? addDays(prev, 7) : new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }
  function goToday() {
    setAnchor(new Date())
  }

  async function manualRefresh() {
    try {
      setRefreshing(true)
      await refreshAppleCalendar()
      await load({ refresh: true })
    } catch (err) {
      const e = err as { message?: string }
      setError(e.message || 'Erreur pendant le rafraîchissement.')
    } finally {
      setRefreshing(false)
    }
  }

  const headerLabel = useMemo(() => {
    if (mode === 'week') {
      const ws = startOfWeek(anchor)
      const we = addDays(ws, 6)
      if (ws.getMonth() === we.getMonth()) {
        return `Semaine du ${ws.getDate()} – ${we.getDate()} ${MONTH_NAMES[ws.getMonth()]} ${ws.getFullYear()}`
      }
      return `${ws.getDate()} ${MONTH_NAMES[ws.getMonth()]} – ${we.getDate()} ${MONTH_NAMES[we.getMonth()]} ${we.getFullYear()}`
    }
    return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`
  }, [mode, anchor])

  return (
    <div className="edu-cal">
      <div className="edu-row between edu-cal-toolbar">
        <div>
          <h1 className="edu-h1"><CalendarDays size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />Calendrier pédagogique</h1>
          <p className="edu-sub">
            Lecture seule depuis Apple Calendar (iCloud). Cache 15 min.
            {payload?.fetchedAt && (
              <> · Dernier sync : <strong style={{ color: 'rgba(255,255,255,0.75)' }}>{new Date(payload.fetchedAt).toLocaleString('fr-FR')}</strong>
                {payload.fromCache && <span style={{ marginLeft: 6, opacity: 0.65 }}>(cache)</span>}
              </>
            )}
          </p>
        </div>
        <div className="edu-row" style={{ gap: 6 }}>
          <button
            className={`edu-btn ghost ${mode === 'week' ? 'is-active' : ''}`}
            onClick={() => setMode('week')}
            aria-pressed={mode === 'week'}
          >
            Semaine
          </button>
          <button
            className={`edu-btn ghost ${mode === 'month' ? 'is-active' : ''}`}
            onClick={() => setMode('month')}
            aria-pressed={mode === 'month'}
          >
            Mois
          </button>
          <button className="edu-btn ghost" onClick={manualRefresh} disabled={refreshing} title="Forcer un sync iCloud">
            <RefreshCw size={14} className={refreshing ? 'edu-spin' : ''} /> Sync
          </button>
        </div>
      </div>

      <div className="edu-row edu-cal-nav">
        <button className="edu-btn-icon" onClick={goPrev} aria-label="Précédent"><ChevronLeft size={16} /></button>
        <button className="edu-btn ghost" onClick={goToday}>Aujourd'hui</button>
        <button className="edu-btn-icon" onClick={goNext} aria-label="Suivant"><ChevronRight size={16} /></button>
        <div className="edu-cal-label">{headerLabel}</div>
      </div>

      {unconfigured && (
        <div className="edu-cal-state" role="alert">
          <AlertTriangle size={18} />
          <div>
            <div style={{ fontWeight: 600 }}>Calendrier Apple non configuré côté serveur.</div>
            <div style={{ opacity: 0.75, fontSize: 13 }}>
              Définir la variable d'environnement <code>EDUCATION_APPLE_CALENDAR_ICS_URL</code> avec le lien iCloud public de partage.
            </div>
          </div>
        </div>
      )}

      {error && !unconfigured && (
        <div className="edu-cal-state edu-cal-state-error" role="alert">
          <AlertTriangle size={18} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Erreur de chargement</div>
            <div style={{ opacity: 0.85, fontSize: 13 }}>{error}</div>
          </div>
          <button className="edu-btn ghost" onClick={() => load()}>Réessayer</button>
        </div>
      )}

      {loading && !payload && (
        <div className="edu-cal-state" aria-busy="true">Chargement du calendrier…</div>
      )}

      {payload && !error && (
        <>
          {mode === 'week'
            ? <WeekGrid weekStart={startOfWeek(anchor)} eventsByDay={eventsByDay} onPick={setSelectedEvent} />
            : <MonthGrid anchor={anchor} eventsByDay={eventsByDay} onPick={setSelectedEvent} />}

          <UpcomingList events={payload.events} />
        </>
      )}

      {selectedEvent && <EventDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />}

      <CalendarStyles />
    </div>
  )
}

// ───────────────────────────── Calcul de fenêtre ───────────────────────────

function computeRange(mode: Mode, anchor: Date): { from: Date; to: Date } {
  if (mode === 'week') {
    const ws = startOfWeek(anchor)
    const we = addDays(ws, 7)
    we.setHours(0, 0, 0, 0)
    return { from: ws, to: we }
  }
  // Mois : on récupère aussi la semaine qui dépasse de chaque côté pour la grille 6×7.
  const ms = startOfMonth(anchor)
  const me = endOfMonth(anchor)
  return { from: addDays(startOfWeek(ms), 0), to: addDays(endOfWeekInclusive(me), 1) }
}

function endOfWeekInclusive(d: Date): Date {
  const ws = startOfWeek(d)
  return addDays(ws, 6)
}

// ───────────────────────────── Vue semaine ─────────────────────────────────

function WeekGrid({
  weekStart, eventsByDay, onPick,
}: { weekStart: Date; eventsByDay: Map<string, AppleCalendarEvent[]>; onPick: (ev: AppleCalendarEvent) => void }) {
  const today = new Date()
  const days: Date[] = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  return (
    <div className="edu-cal-week">
      {days.map((day, i) => {
        const key = formatDayKey(day)
        const dayEvents = eventsByDay.get(key) || []
        const isToday = sameDay(day, today)
        return (
          <div key={key} className={`edu-cal-week-col ${isToday ? 'is-today' : ''}`}>
            <div className="edu-cal-week-head">
              <span>{DAY_NAMES_SHORT[i]}</span>
              <strong>{day.getDate()}</strong>
            </div>
            <div className="edu-cal-week-body">
              {dayEvents.length === 0 && <div className="edu-cal-week-empty">—</div>}
              {dayEvents.map((ev) => (
                <button
                  key={ev.occurrenceId}
                  className="edu-cal-event"
                  style={{ borderLeftColor: eventColor(ev) }}
                  onClick={() => onPick(ev)}
                >
                  <div className="edu-cal-event-time">
                    {ev.allDay ? 'Journée' : formatTime(ev.start)}
                  </div>
                  <div className="edu-cal-event-title">{ev.title}</div>
                  {ev.location && <div className="edu-cal-event-meta"><MapPin size={11} /> {ev.location}</div>}
                  {ev.school && <span className="edu-cal-event-school">{ev.school}</span>}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ───────────────────────────── Vue mois ────────────────────────────────────

function MonthGrid({
  anchor, eventsByDay, onPick,
}: { anchor: Date; eventsByDay: Map<string, AppleCalendarEvent[]>; onPick: (ev: AppleCalendarEvent) => void }) {
  const ms = startOfMonth(anchor)
  const gridStart = startOfWeek(ms)
  const today = new Date()
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  return (
    <div className="edu-cal-month">
      <div className="edu-cal-month-head">
        {DAY_NAMES_SHORT.map((d) => (<div key={d}>{d}</div>))}
      </div>
      <div className="edu-cal-month-body">
        {cells.map((day) => {
          const key = formatDayKey(day)
          const dayEvents = eventsByDay.get(key) || []
          const inMonth = day.getMonth() === anchor.getMonth()
          const isToday = sameDay(day, today)
          return (
            <div
              key={key}
              className={`edu-cal-month-cell ${inMonth ? '' : 'is-out'} ${isToday ? 'is-today' : ''}`}
            >
              <div className="edu-cal-month-day">{day.getDate()}</div>
              <div className="edu-cal-month-events">
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.occurrenceId}
                    className="edu-cal-event compact"
                    style={{ borderLeftColor: eventColor(ev) }}
                    onClick={() => onPick(ev)}
                  >
                    <span className="edu-cal-event-time">{ev.allDay ? '·' : formatTime(ev.start)}</span>
                    <span className="edu-cal-event-title">{ev.title}</span>
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <div className="edu-cal-event-more">+{dayEvents.length - 3} de plus</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ───────────────────────────── Prochains événements ────────────────────────

function UpcomingList({ events }: { events: AppleCalendarEvent[] }) {
  const now = Date.now()
  const upcoming = events
    .filter((e) => new Date(e.end).getTime() >= now)
    .slice(0, 8)
  if (upcoming.length === 0) {
    return (
      <div className="edu-cal-upcoming">
        <h2 className="edu-h2">Prochains événements</h2>
        <div className="edu-empty">
          <div className="edu-empty-icon">📅</div>
          <div>Pas de prochain événement dans la fenêtre actuelle.</div>
        </div>
      </div>
    )
  }
  return (
    <div className="edu-cal-upcoming">
      <h2 className="edu-h2">Prochains événements</h2>
      <div className="edu-cal-upcoming-list">
        {upcoming.map((ev) => (
          <div key={ev.occurrenceId} className="edu-cal-upcoming-item" style={{ borderLeftColor: eventColor(ev) }}>
            <div style={{ flex: 1 }}>
              <div className="edu-cal-upcoming-title">{ev.title}</div>
              <div className="edu-cal-upcoming-meta">
                <Clock size={12} />
                {new Date(ev.start).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
                {' · '}
                {formatRange(ev.start, ev.end, ev.allDay)}
                {ev.location && <> · <MapPin size={12} /> {ev.location}</>}
                {ev.school && <span className="edu-cal-event-school" style={{ marginLeft: 6 }}>{ev.school}</span>}
              </div>
            </div>
            <Apple size={12} aria-label="Apple Calendar" style={{ opacity: 0.4 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ───────────────────────────── Détail événement ────────────────────────────

function EventDrawer({ event, onClose }: { event: AppleCalendarEvent; onClose: () => void }) {
  const start = new Date(event.start)
  const dayLabel = `${DAY_NAMES_LONG[(start.getDay() + 6) % 7]} ${start.getDate()} ${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`
  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <div>
            <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>{event.title || '(Sans titre)'}</h2>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              <Apple size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Apple Calendar
              {event.status && ` · ${event.status.toLowerCase()}`}
            </div>
          </div>
          <button className="edu-btn ghost" onClick={onClose}>Fermer</button>
        </div>
        <div className="edu-drawer-body">
          <div className="edu-form-group">
            <label>Quand</label>
            <div>{dayLabel}</div>
            <div style={{ marginTop: 4 }}>{formatRange(event.start, event.end, event.allDay)} · {durationLabel(event.durationMin)}</div>
          </div>
          {event.location && (
            <div className="edu-form-group">
              <label>Lieu</label>
              <div>{event.location}</div>
            </div>
          )}
          {(event.school || event.classLabel) && (
            <div className="edu-form-group">
              <label>Inféré</label>
              <div className="edu-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {event.school && <span className="edu-pill">{event.school}</span>}
                {event.classLabel && <span className="edu-pill">{event.classLabel}</span>}
              </div>
            </div>
          )}
          {event.description && (
            <div className="edu-form-group">
              <label>Description</label>
              <div style={{ whiteSpace: 'pre-wrap' }}>{event.description}</div>
            </div>
          )}
          {event.url && (
            <div className="edu-form-group">
              <label>Lien</label>
              <a href={event.url} target="_blank" rel="noreferrer" style={{ color: '#0EA5E9' }}>{event.url}</a>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ───────────────────────────── Styles inline scopés ────────────────────────
// Les autres vues de l'espace pédagogique injectent leur CSS via
// EducationWorkspace.css. Pour rester atomique et éviter de toucher au
// CSS global, on garde les styles spécifiques au calendrier ici.

function CalendarStyles() {
  return (
    <style>{`
      .edu-cal { display: flex; flex-direction: column; gap: 14px; }
      .edu-cal-toolbar { gap: 12px; flex-wrap: wrap; }
      .edu-cal-nav { gap: 6px; align-items: center; }
      .edu-cal-label { margin-left: 8px; font-weight: 600; font-size: 15px; }
      .edu-cal .edu-btn.ghost.is-active {
        background: rgba(34,197,94,0.15);
        color: #86EFAC;
        border-color: rgba(34,197,94,0.35);
      }
      .edu-spin { animation: edu-cal-spin 1s linear infinite; }
      @keyframes edu-cal-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

      .edu-cal-state {
        display: flex; gap: 12px; align-items: center;
        padding: 14px 16px; border-radius: 10px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .edu-cal-state-error { border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.08); }

      .edu-cal-week {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 8px;
      }
      .edu-cal-week-col {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
        display: flex; flex-direction: column;
        min-height: 220px;
      }
      .edu-cal-week-col.is-today { border-color: rgba(34,197,94,0.45); background: rgba(34,197,94,0.05); }
      .edu-cal-week-head {
        display: flex; justify-content: space-between; align-items: baseline;
        padding: 8px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        font-size: 12px; color: rgba(255,255,255,0.6);
      }
      .edu-cal-week-head strong { color: #fff; font-size: 16px; }
      .edu-cal-week-body { padding: 6px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
      .edu-cal-week-empty { font-size: 11px; color: rgba(255,255,255,0.3); padding: 6px; text-align: center; }

      .edu-cal-event {
        display: block; text-align: left; width: 100%;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.06);
        border-left: 3px solid var(--edu-color, #22C55E);
        border-radius: 8px;
        padding: 6px 8px;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.12s ease, transform 0.12s ease;
      }
      .edu-cal-event:hover { background: rgba(255,255,255,0.09); transform: translateY(-1px); }
      .edu-cal-event-time { color: rgba(255,255,255,0.55); font-size: 11px; margin-bottom: 2px; }
      .edu-cal-event-title { color: #fff; font-weight: 500; line-height: 1.25; overflow-wrap: anywhere; }
      .edu-cal-event-meta { color: rgba(255,255,255,0.55); font-size: 11px; margin-top: 3px; display: inline-flex; align-items: center; gap: 4px; }
      .edu-cal-event-school {
        display: inline-block; margin-top: 4px;
        font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase;
        background: rgba(14,165,233,0.18); color: #BAE6FD;
        padding: 2px 6px; border-radius: 4px;
      }
      .edu-cal-event.compact {
        display: flex; align-items: center; gap: 6px;
        padding: 3px 6px;
        background: transparent;
        border: none;
        border-left: 3px solid var(--edu-color, #22C55E);
        border-radius: 0;
      }
      .edu-cal-event.compact .edu-cal-event-time { margin: 0; font-size: 10px; color: rgba(255,255,255,0.5); }
      .edu-cal-event.compact .edu-cal-event-title { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      .edu-cal-month {
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
        overflow: hidden;
      }
      .edu-cal-month-head {
        display: grid; grid-template-columns: repeat(7, 1fr);
        background: rgba(255,255,255,0.04);
        font-size: 11px; color: rgba(255,255,255,0.55);
      }
      .edu-cal-month-head > div { padding: 8px 10px; }
      .edu-cal-month-body { display: grid; grid-template-columns: repeat(7, 1fr); }
      .edu-cal-month-cell {
        border-top: 1px solid rgba(255,255,255,0.05);
        border-left: 1px solid rgba(255,255,255,0.05);
        min-height: 96px;
        padding: 4px 5px;
        display: flex; flex-direction: column; gap: 3px;
      }
      .edu-cal-month-cell.is-out { background: rgba(0,0,0,0.18); opacity: 0.55; }
      .edu-cal-month-cell.is-today { background: rgba(34,197,94,0.07); }
      .edu-cal-month-day { font-size: 12px; color: rgba(255,255,255,0.65); }
      .edu-cal-month-events { display: flex; flex-direction: column; gap: 2px; }
      .edu-cal-event-more { font-size: 10px; color: rgba(255,255,255,0.55); padding-left: 6px; }

      .edu-cal-upcoming { margin-top: 8px; }
      .edu-cal-upcoming-list { display: flex; flex-direction: column; gap: 6px; }
      .edu-cal-upcoming-item {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 12px;
        background: rgba(255,255,255,0.04);
        border-left: 3px solid var(--edu-color, #22C55E);
        border-radius: 8px;
      }
      .edu-cal-upcoming-title { font-size: 14px; font-weight: 500; }
      .edu-cal-upcoming-meta { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 2px; display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }

      @media (max-width: 900px) {
        .edu-cal-week { grid-template-columns: 1fr; }
        .edu-cal-week-col { min-height: auto; }
        .edu-cal-month-cell { min-height: 70px; }
      }
    `}</style>
  )
}

export default CalendarView
