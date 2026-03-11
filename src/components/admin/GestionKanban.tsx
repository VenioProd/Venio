import { useState, type DragEvent } from 'react'
import type { Task, TaskStatus } from '../../types/task.types'

const COLUMNS: { key: TaskStatus; label: string; color: string }[] = [
  { key: 'A_FAIRE', label: 'A faire', color: '#64748b' },
  { key: 'EN_COURS', label: 'En cours', color: '#0ea5e9' },
  { key: 'EN_REVIEW', label: 'En review', color: '#f59e0b' },
  { key: 'VALIDE', label: 'Valide', color: '#22c55e' },
  { key: 'NON_VALIDE', label: 'Non valide', color: '#ef4444' },
  { key: 'A_MODIFIER', label: 'A modifier', color: '#fb923c' },
  { key: 'TERMINE', label: 'Termine', color: '#22c55e' },
]

const PRIORITY_COLORS: Record<string, string> = {
  BASSE: '#64748b',
  NORMALE: '#0ea5e9',
  HAUTE: '#f59e0b',
  URGENTE: '#ef4444',
}

interface Props {
  tasks: Task[]
  loading: boolean
  onMove: (projectId: string, taskId: string, status: string, order: number) => Promise<void>
  onUpdate: (projectId: string, taskId: string, data: Record<string, unknown>) => Promise<void>
  getProjectId: (task: Task) => string
  readOnly?: boolean
}

export default function GestionKanban({ tasks, loading, onMove, getProjectId, readOnly }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const getProjectName = (task: Task) => {
    if (typeof task.project === 'object' && task.project?.name) return task.project.name
    return ''
  }

  const formatDate = (d: string | null) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  }

  const handleDragStart = (e: DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId)
    setDraggingId(taskId)
  }

  const handleDrop = (e: DragEvent, status: TaskStatus) => {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('taskId')
    const task = tasks.find(t => t._id === taskId)
    if (!task || task.status === status) { setDraggingId(null); return }

    const colTasks = tasks.filter(t => t.status === status)
    const order = colTasks.length
    onMove(getProjectId(task), taskId, status, order)
    setDraggingId(null)
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
  }

  if (loading) return <div className="gestion-loading">Chargement...</div>

  return (
    <div className="gestion-kanban">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter(t => t.status === col.key).sort((a, b) => a.order - b.order)
        return (
          <div
            key={col.key}
            className="gestion-kanban-col"
            onDrop={(e) => handleDrop(e, col.key)}
            onDragOver={handleDragOver}
          >
            <div className="gestion-kanban-header" style={{ borderTopColor: col.color }}>
              <span className="gestion-kanban-title">{col.label}</span>
              <span className="gestion-kanban-count">{colTasks.length}</span>
            </div>
            <div className="gestion-kanban-cards">
              {colTasks.map((task) => (
                <div
                  key={task._id}
                  className={`gestion-kanban-card ${draggingId === task._id ? 'dragging' : ''} ${task.progress === 100 && task.status !== 'TERMINE' && task.status !== 'VALIDE' ? 'gestion-kanban-card-ready' : ''}`}
                  draggable={!readOnly}
                  onDragStart={readOnly ? undefined : (e) => handleDragStart(e, task._id)}
                >
                  <div className="gestion-kanban-card-top">
                    <span
                      className="gestion-kanban-priority"
                      style={{ background: PRIORITY_COLORS[task.priority] }}
                      title={task.priority}
                    />
                    {getProjectName(task) && (
                      <span className="gestion-kanban-project">{getProjectName(task)}</span>
                    )}
                  </div>
                  <div className="gestion-kanban-card-title">{task.title}</div>
                  <div className="gestion-kanban-card-meta">
                    {task.assignee && (
                      <span className="gestion-kanban-assignee">
                        {task.assignee.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </span>
                    )}
                    {task.dueDate && (
                      <span className={`gestion-kanban-date ${task.status !== 'TERMINE' && task.status !== 'VALIDE' && new Date(task.dueDate) < new Date() ? 'overdue' : ''}`}>
                        {formatDate(task.dueDate)}
                      </span>
                    )}
                    {task.progress > 0 && (
                      <span className="gestion-kanban-progress">{task.progress}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
