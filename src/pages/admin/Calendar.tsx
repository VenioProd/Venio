import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import './AdminPortal.css'
import '../../styles/calendar.css'

interface CalendarEvent {
  id: string
  type: 'task' | 'deadline' | 'project_start' | 'project_end'
  title: string
  date: string
  projectId: string
  projectName: string
  metadata?: {
    status?: string
    priority?: string
  }
}

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const MONTH_NAMES = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
]

const TYPE_LABELS: Record<string, string> = {
  task: 'Tâche',
  deadline: 'Deadline',
  project_start: 'Début projet',
  project_end: 'Fin projet',
}

const LEGEND_ITEMS = [
  { type: 'task', label: 'Tâches', color: '#0ea5e9' },
  { type: 'deadline', label: 'Deadlines', color: '#ef4444' },
  { type: 'project_start', label: 'Début projet', color: '#22c55e' },
  { type: 'project_end', label: 'Fin projet', color: '#f97316' },
]

function formatDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Monday-based: getDay() returns 0=Sun, so shift
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const days: { date: Date; isCurrentMonth: boolean }[] = []

  // Fill previous month days
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: d, isCurrentMonth: false })
  }

  // Current month days
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), isCurrentMonth: true })
  }

  // Fill next month days to complete 6 weeks (42 cells) or at least 5 weeks (35)
  const totalNeeded = days.length <= 35 ? 35 : 42
  while (days.length < totalNeeded) {
    const nextDate = new Date(year, month + 1, days.length - lastDay.getDate() - startDow + 1)
    days.push({ date: nextDate, isCurrentMonth: false })
  }

  return days
}

export default function Calendar() {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const fetchEvents = useCallback(async (year: number, month: number) => {
    setLoading(true)
    try {
      // Fetch a wider range to cover visible days from prev/next months
      const start = new Date(year, month - 1, 1)
      const end = new Date(year, month + 2, 0)
      const startStr = formatDateKey(start)
      const endStr = formatDateKey(end)
      const res = await apiFetch<{ events: CalendarEvent[] }>(
        `/api/admin/calendar/events?start=${startStr}&end=${endStr}`,
      )
      setEvents(res.events)
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents(currentMonth.getFullYear(), currentMonth.getMonth())
  }, [currentMonth, fetchEvents])

  const goToPrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
    setSelectedDate(null)
  }

  const goToNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
    setSelectedDate(null)
  }

  const goToToday = () => {
    const now = new Date()
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDate(formatDateKey(now))
  }

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const calendarDays = getCalendarDays(year, month)
  const todayKey = formatDateKey(new Date())

  // Group events by date
  const eventsByDate: Record<string, CalendarEvent[]> = {}
  for (const ev of events) {
    if (!eventsByDate[ev.date]) eventsByDate[ev.date] = []
    eventsByDate[ev.date].push(ev)
  }

  const selectedEvents = selectedDate ? eventsByDate[selectedDate] || [] : []

  const selectedDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : null
  const selectedLabel = selectedDateObj
    ? `${selectedDateObj.getDate()} ${MONTH_NAMES[selectedDateObj.getMonth()]} ${selectedDateObj.getFullYear()}`
    : ''

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>Calendrier</span>
        </div>
        <div className="admin-header">
          <h1>Calendrier</h1>
        </div>
      </div>

      <div className="calendar-page">
        {/* Navigation */}
        <div className="calendar-header">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="calendar-nav-btn" onClick={goToPrevMonth} title="Mois précédent">
              &#8592;
            </button>
            <button className="calendar-today-btn" onClick={goToToday}>
              Aujourd&apos;hui
            </button>
            <button className="calendar-nav-btn" onClick={goToNextMonth} title="Mois suivant">
              &#8594;
            </button>
          </div>
          <h2>
            {MONTH_NAMES[month]} {year}
          </h2>
          <div style={{ width: 120 }} />
        </div>

        {loading ? (
          <div className="calendar-loading">Chargement...</div>
        ) : (
          <>
            {/* Calendar Grid */}
            <div className="calendar-grid">
              {/* Day Headers */}
              {DAY_NAMES.map((day) => (
                <div key={day} className="calendar-day-header">
                  {day}
                </div>
              ))}

              {/* Day Cells */}
              {calendarDays.map(({ date, isCurrentMonth }) => {
                const key = formatDateKey(date)
                const dayEvents = eventsByDate[key] || []
                const isToday = key === todayKey
                const isSelected = key === selectedDate
                const hasEvents = dayEvents.length > 0

                const classes = [
                  'calendar-day',
                  !isCurrentMonth && 'other-month',
                  isToday && 'today',
                  isSelected && 'selected',
                  hasEvents && 'has-events',
                ]
                  .filter(Boolean)
                  .join(' ')

                return (
                  <div key={key} className={classes} onClick={() => setSelectedDate(isSelected ? null : key)}>
                    <span className="calendar-day-number">{date.getDate()}</span>
                    {dayEvents.length > 0 && (
                      <div className="calendar-events">
                        {dayEvents.slice(0, 3).map((ev) => (
                          <div key={ev.id} className={`calendar-event type-${ev.type}`}>
                            {ev.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="calendar-event-more">+{dayEvents.length - 3} de plus</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="calendar-legend">
              {LEGEND_ITEMS.map((item) => (
                <div key={item.type} className="calendar-legend-item">
                  <span className="calendar-legend-dot" style={{ background: item.color }} />
                  {item.label}
                </div>
              ))}
            </div>

            {/* Day Detail Panel */}
            {selectedDate && (
              <div className="calendar-day-detail">
                <div className="calendar-detail-header">
                  <h3>{selectedLabel}</h3>
                  <button className="calendar-detail-close" onClick={() => setSelectedDate(null)}>
                    Fermer
                  </button>
                </div>
                {selectedEvents.length === 0 ? (
                  <div className="calendar-empty-state">Aucun événement ce jour</div>
                ) : (
                  <div className="calendar-detail-list">
                    {selectedEvents.map((ev) => (
                      <Link
                        key={ev.id}
                        to={`/admin/projets/${ev.projectId}`}
                        className="calendar-detail-item"
                        style={{ textDecoration: 'none' }}
                      >
                        <span className={`calendar-detail-dot type-${ev.type}`} />
                        <div className="calendar-detail-info">
                          <div className="calendar-detail-title">{ev.title}</div>
                          <div className="calendar-detail-meta">
                            {ev.projectName}
                            {ev.metadata?.status && ` — ${ev.metadata.status}`}
                            {ev.metadata?.priority && ` — ${ev.metadata.priority}`}
                          </div>
                        </div>
                        <span className={`calendar-detail-type type-${ev.type}`}>
                          {TYPE_LABELS[ev.type] || ev.type}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
