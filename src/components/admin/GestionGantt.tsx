import { useState, useMemo, useCallback } from 'react'
import type { Task } from '../../types/task.types'

const PRIORITY_COLORS: Record<string, string> = {
  BASSE: '#64748b',
  NORMALE: '#0ea5e9',
  HAUTE: '#f59e0b',
  URGENTE: '#ef4444',
}

const STATUS_LABELS: Record<string, string> = {
  A_FAIRE: 'A faire',
  EN_COURS: 'En cours',
  EN_REVIEW: 'En review',
  TERMINE: 'Termine',
  VALIDE: 'Valide',
  NON_VALIDE: 'Non valide',
  A_MODIFIER: 'A modifier',
}

type ViewMode = 'day' | 'week' | 'month'

interface Props {
  tasks: Task[]
  loading: boolean
  onUpdate: (projectId: string, taskId: string, data: Record<string, unknown>) => Promise<void>
  getProjectId: (task: Task) => string
  readOnly?: boolean
}

function addDays(date: Date, days: number): Date {
  const r = new Date(date)
  r.setDate(r.getDate() + days)
  return r
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function startOfWeek(d: Date): Date {
  const r = startOfDay(d)
  const day = r.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday
  r.setDate(r.getDate() + diff)
  return r
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export default function GestionGantt({ tasks, loading, onUpdate, getProjectId, readOnly }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState<Date>(startOfDay(new Date()))
  const [dragState, setDragState] = useState<{
    taskId: string
    type: 'move' | 'resize'
    startX: number
    origStart: Date
    origEnd: Date
  } | null>(null)

  // Compute visible range based on view mode
  const { rangeStart, rangeEnd, totalDays, colWidth, columns, rangeLabel } = useMemo(() => {
    let rStart: Date, rEnd: Date, cw: number
    const cols: { date: Date; label: string; sub?: string }[] = []

    if (viewMode === 'day') {
      // Show 1 day, columns = hours (8h-20h)
      rStart = startOfDay(currentDate)
      rEnd = addDays(rStart, 1)
      cw = 70
      for (let h = 8; h <= 20; h++) {
        const d = new Date(rStart)
        d.setHours(h)
        cols.push({ date: d, label: `${h}h` })
      }
      return {
        rangeStart: rStart,
        rangeEnd: rEnd,
        totalDays: 1,
        colWidth: cw,
        columns: cols,
        rangeLabel: rStart.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      }
    } else if (viewMode === 'week') {
      rStart = startOfWeek(currentDate)
      rEnd = addDays(rStart, 7)
      cw = 120
      const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
      for (let i = 0; i < 7; i++) {
        const d = addDays(rStart, i)
        cols.push({ date: d, label: dayNames[i], sub: d.getDate().toString() })
      }
      return {
        rangeStart: rStart,
        rangeEnd: rEnd,
        totalDays: 7,
        colWidth: cw,
        columns: cols,
        rangeLabel: `${formatDateShort(rStart)} — ${formatDateShort(addDays(rEnd, -1))}`,
      }
    } else {
      rStart = startOfMonth(currentDate)
      const nextMonth = new Date(rStart.getFullYear(), rStart.getMonth() + 1, 1)
      rEnd = nextMonth
      const daysInMonth = diffDays(rStart, rEnd)
      cw = 36
      for (let i = 0; i < daysInMonth; i++) {
        const d = addDays(rStart, i)
        cols.push({ date: d, label: d.getDate().toString(), sub: d.getDay() === 0 || d.getDay() === 6 ? 'we' : '' })
      }
      return {
        rangeStart: rStart,
        rangeEnd: rEnd,
        totalDays: daysInMonth,
        colWidth: cw,
        columns: cols,
        rangeLabel: rStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
      }
    }
  }, [viewMode, currentDate])

  // Navigate
  const navigate = (dir: -1 | 1) => {
    if (viewMode === 'day') setCurrentDate((prev) => addDays(prev, dir))
    else if (viewMode === 'week') setCurrentDate((prev) => addDays(prev, dir * 7))
    else setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + dir, 1))
  }

  const goToday = () => setCurrentDate(startOfDay(new Date()))

  // Prepare tasks with dates
  const ganttTasks = useMemo(() => {
    return (
      tasks
        .filter((t) => t.startDate || t.dueDate || t.createdAt)
        .map((t) => {
          const start = startOfDay(
            t.startDate ? new Date(t.startDate) : t.dueDate ? addDays(new Date(t.dueDate), -3) : new Date(t.createdAt),
          )
          const end = startOfDay(
            t.dueDate
              ? new Date(t.dueDate)
              : addDays(start, t.estimatedDuration ? Math.ceil(t.estimatedDuration / 8) : 3),
          )
          const safeEnd = end > start ? end : addDays(start, 1)
          return { ...t, _start: start, _end: safeEnd }
        })
        // Filter to tasks visible in range
        .filter((t) => t._end > rangeStart && t._start < rangeEnd)
        .sort((a, b) => a._start.getTime() - b._start.getTime())
    )
  }, [tasks, rangeStart, rangeEnd])

  const chartWidth = viewMode === 'day' ? columns.length * colWidth : totalDays * colWidth
  const rowHeight = 48

  const getBarPosition = (task: (typeof ganttTasks)[0]) => {
    if (viewMode === 'day') {
      // For day view, bar spans full day
      const dayStart = 8 // 8h
      const dayEnd = 20
      const totalHours = dayEnd - dayStart
      return { left: 0, width: totalHours * colWidth }
    }
    const clampedStart = task._start < rangeStart ? rangeStart : task._start
    const clampedEnd = task._end > rangeEnd ? rangeEnd : task._end
    const startOffset = diffDays(rangeStart, clampedStart)
    const duration = Math.max(diffDays(clampedStart, clampedEnd), 1)
    const left = startOffset * colWidth
    const width = Math.max(duration * colWidth - 4, 20)
    return { left: left + 2, width }
  }

  const getProjectName = (task: Task) => {
    if (typeof task.project === 'object' && task.project?.name) return task.project.name
    return ''
  }

  // Drag handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, taskId: string, type: 'move' | 'resize', start: Date, end: Date) => {
      e.preventDefault()
      e.stopPropagation()
      setDragState({ taskId, type, startX: e.clientX, origStart: new Date(start), origEnd: new Date(end) })
    },
    [],
  )

  const handleMouseUp = useCallback(
    async (e: React.MouseEvent) => {
      if (!dragState) return
      const dx = e.clientX - dragState.startX
      const daysDelta = Math.round(dx / colWidth)
      if (daysDelta === 0) {
        setDragState(null)
        return
      }

      const task = ganttTasks.find((t) => t._id === dragState.taskId)
      if (!task) {
        setDragState(null)
        return
      }

      if (dragState.type === 'move') {
        const newStart = addDays(dragState.origStart, daysDelta)
        const newEnd = addDays(dragState.origEnd, daysDelta)
        await onUpdate(getProjectId(task), task._id, {
          startDate: newStart.toISOString(),
          dueDate: newEnd.toISOString(),
        })
      } else {
        const newEnd = addDays(dragState.origEnd, daysDelta)
        if (newEnd > dragState.origStart) {
          await onUpdate(getProjectId(task), task._id, { dueDate: newEnd.toISOString() })
        }
      }
      setDragState(null)
    },
    [dragState, colWidth, ganttTasks, onUpdate, getProjectId],
  )

  const today = startOfDay(new Date())

  if (loading) return <div className="gestion-loading">Chargement...</div>

  return (
    <div className="gestion-gantt-wrap">
      {/* Controls */}
      <div className="gestion-gantt-controls">
        <div className="gantt-mode-group">
          {[
            { mode: 'day' as ViewMode, label: 'Jour' },
            { mode: 'week' as ViewMode, label: 'Semaine' },
            { mode: 'month' as ViewMode, label: 'Mois' },
          ].map(({ mode, label }) => (
            <button
              key={mode}
              className={`gestion-gantt-mode-btn ${viewMode === mode ? 'active' : ''}`}
              onClick={() => setViewMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="gantt-nav">
          <button className="gantt-nav-btn" onClick={() => navigate(-1)}>
            ←
          </button>
          <button className="gantt-nav-today" onClick={goToday}>
            Aujourd'hui
          </button>
          <button className="gantt-nav-btn" onClick={() => navigate(1)}>
            →
          </button>
        </div>
        <span className="gantt-range-label">{rangeLabel}</span>
      </div>

      {ganttTasks.length === 0 ? (
        <div className="gestion-empty-state" style={{ padding: '40px 0' }}>
          <p>Aucune tache visible sur cette periode.</p>
        </div>
      ) : (
        <div className="gantt-container" onMouseUp={handleMouseUp} onMouseLeave={() => setDragState(null)}>
          {/* Left panel: task list */}
          <div className="gantt-list">
            <div className="gantt-list-header" style={{ height: 52 }}>
              <span>Tache</span>
              <span>Dates</span>
            </div>
            {ganttTasks.map((task) => (
              <div key={task._id} className="gantt-list-row" style={{ height: rowHeight }}>
                <div className="gantt-list-name">
                  <span className="gantt-list-dot" style={{ background: PRIORITY_COLORS[task.priority] }} />
                  <div className="gantt-list-text">
                    <span className="gantt-list-title">{task.title}</span>
                    <span className="gantt-list-project">{getProjectName(task)}</span>
                  </div>
                </div>
                <div className="gantt-list-dates">
                  {formatDateShort(task._start)} → {formatDateShort(task._end)}
                </div>
              </div>
            ))}
          </div>

          {/* Right panel: chart */}
          <div className="gantt-chart-scroll">
            <div className="gantt-chart" style={{ width: chartWidth, minHeight: ganttTasks.length * rowHeight + 52 }}>
              {/* Column headers */}
              <div className="gantt-col-headers" style={{ height: 52 }}>
                {columns.map((col, i) => (
                  <div
                    key={i}
                    className={`gantt-col-header ${col.sub === 'we' ? 'gantt-col-weekend' : ''}`}
                    style={{ left: i * colWidth, width: colWidth }}
                  >
                    <span className="gantt-col-label">{col.label}</span>
                    {col.sub && col.sub !== 'we' && <span className="gantt-col-sub">{col.sub}</span>}
                  </div>
                ))}
              </div>

              {/* Grid lines */}
              {columns.map((col, i) => (
                <div
                  key={i}
                  className={`gantt-grid-line ${col.sub === 'we' ? 'gantt-grid-weekend' : ''}`}
                  style={{ left: i * colWidth, top: 52, width: colWidth }}
                />
              ))}

              {/* Today highlight */}
              {viewMode !== 'day' &&
                (() => {
                  const todayOff = diffDays(rangeStart, today)
                  if (todayOff >= 0 && todayOff < totalDays) {
                    return (
                      <div
                        className="gantt-today-col"
                        style={{ left: todayOff * colWidth, width: colWidth, top: 52 }}
                      />
                    )
                  }
                  return null
                })()}

              {/* Rows & bars */}
              {ganttTasks.map((task, idx) => {
                const { left, width } = getBarPosition(task)
                const color = PRIORITY_COLORS[task.priority] || '#0ea5e9'
                const isOverdue =
                  task.dueDate &&
                  task.status !== 'TERMINE' &&
                  task.status !== 'VALIDE' &&
                  new Date(task.dueDate) < today

                return (
                  <div
                    key={task._id}
                    className={`gantt-row ${idx % 2 === 0 ? 'gantt-row-even' : ''}`}
                    style={{ top: 52 + idx * rowHeight, height: rowHeight }}
                  >
                    <div
                      className={`gantt-bar ${dragState?.taskId === task._id ? 'gantt-bar-dragging' : ''}`}
                      style={{ left, width }}
                      onMouseDown={
                        readOnly ? undefined : (e) => handleMouseDown(e, task._id, 'move', task._start, task._end)
                      }
                      title={`${task.title}\n${formatDateShort(task._start)} → ${formatDateShort(task._end)}\n${STATUS_LABELS[task.status]} — ${task.progress}%`}
                    >
                      <div className="gantt-bar-track" style={{ background: `${color}25`, borderColor: `${color}50` }}>
                        <div
                          className="gantt-bar-fill"
                          style={{
                            width: `${Math.max(task.progress, 8)}%`,
                            background: color,
                            opacity: task.progress > 0 ? 1 : 0.3,
                          }}
                        />
                      </div>
                      {isOverdue && <div className="gantt-bar-overdue-indicator" />}
                      {task.assignee && (
                        <span className="gantt-bar-avatar" style={{ background: color }}>
                          {task.assignee.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()}
                        </span>
                      )}
                      {/* Resize handle */}
                      {!readOnly && (
                        <div
                          className="gantt-bar-handle"
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            handleMouseDown(e, task._id, 'resize', task._start, task._end)
                          }}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
