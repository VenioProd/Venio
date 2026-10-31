import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
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

const DAY_NAME_KEYS: MessageKey[] = [
  'adminOps.calendar.dayMon',
  'adminOps.calendar.dayTue',
  'adminOps.calendar.dayWed',
  'adminOps.calendar.dayThu',
  'adminOps.calendar.dayFri',
  'adminOps.calendar.daySat',
  'adminOps.calendar.daySun',
]

const MONTH_NAME_KEYS: MessageKey[] = [
  'adminOps.calendar.month1',
  'adminOps.calendar.month2',
  'adminOps.calendar.month3',
  'adminOps.calendar.month4',
  'adminOps.calendar.month5',
  'adminOps.calendar.month6',
  'adminOps.calendar.month7',
  'adminOps.calendar.month8',
  'adminOps.calendar.month9',
  'adminOps.calendar.month10',
  'adminOps.calendar.month11',
  'adminOps.calendar.month12',
]

const TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  task: 'adminOps.calendar.typeTask',
  deadline: 'adminOps.calendar.typeDeadline',
  project_start: 'adminOps.calendar.typeProjectStart',
  project_end: 'adminOps.calendar.typeProjectEnd',
}

const LEGEND_ITEMS: { type: string; labelKey: MessageKey; color: string }[] = [
  { type: 'task', labelKey: 'adminOps.calendar.legendTasks', color: '#0ea5e9' },
  { type: 'deadline', labelKey: 'adminOps.calendar.legendDeadlines', color: '#ef4444' },
  { type: 'project_start', labelKey: 'adminOps.calendar.typeProjectStart', color: '#22c55e' },
  { type: 'project_end', labelKey: 'adminOps.calendar.typeProjectEnd', color: '#f97316' },
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
  const { t } = useI18n()
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
    ? `${selectedDateObj.getDate()} ${t(MONTH_NAME_KEYS[selectedDateObj.getMonth()])} ${selectedDateObj.getFullYear()}`
    : ''

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>{t('adminOps.calendar.title')}</span>
        </div>
        <div className="admin-header">
          <h1>{t('adminOps.calendar.title')}</h1>
        </div>
      </div>

      <div className="calendar-page">
        {/* Navigation */}
        <div className="calendar-header">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="calendar-nav-btn" onClick={goToPrevMonth} title={t('adminOps.calendar.prevMonth')}>
              &#8592;
            </button>
            <button className="calendar-today-btn" onClick={goToToday}>
              {t('adminOps.calendar.today')}
            </button>
            <button className="calendar-nav-btn" onClick={goToNextMonth} title={t('adminOps.calendar.nextMonth')}>
              &#8594;
            </button>
          </div>
          <h2>
            {t(MONTH_NAME_KEYS[month])} {year}
          </h2>
          <div style={{ width: 120 }} />
        </div>

        {loading ? (
          <div className="calendar-loading">{t('common.loading')}</div>
        ) : (
          <>
            {/* Calendar Grid */}
            <div className="calendar-grid">
              {/* Day Headers */}
              {DAY_NAME_KEYS.map((dayKey) => (
                <div key={dayKey} className="calendar-day-header">
                  {t(dayKey)}
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
                          <span className="calendar-event-more">
                            {t('adminOps.calendar.more', { count: dayEvents.length - 3 })}
                          </span>
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
                  {t(item.labelKey)}
                </div>
              ))}
            </div>

            {/* Day Detail Panel */}
            {selectedDate && (
              <div className="calendar-day-detail">
                <div className="calendar-detail-header">
                  <h3>{selectedLabel}</h3>
                  <button className="calendar-detail-close" onClick={() => setSelectedDate(null)}>
                    {t('common.close')}
                  </button>
                </div>
                {selectedEvents.length === 0 ? (
                  <div className="calendar-empty-state">{t('adminOps.calendar.noEvents')}</div>
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
                          {TYPE_LABEL_KEYS[ev.type] ? t(TYPE_LABEL_KEYS[ev.type]) : ev.type}
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
