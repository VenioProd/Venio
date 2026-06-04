import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Circle, CheckCircle2, AlertTriangle } from 'lucide-react'
import { getTasks, createTask, updateTask } from '../../../../services/workspace'
import type { PersonalTask, PersonalTaskStatus } from '../../../../types/workspace.types'

type Mode = 'todo' | 'doing' | 'overdue'

const MODE_STATUS: Record<Mode, PersonalTaskStatus | undefined> = {
  todo: 'A_FAIRE',
  doing: 'EN_COURS',
  overdue: undefined,
}
const MODE_TITLE: Record<Mode, string> = { todo: 'Tâches à faire', doing: 'En cours', overdue: 'En retard' }

export default function TaskListWidget({ mode }: { mode: Mode }) {
  const [tasks, setTasks] = useState<PersonalTask[]>([])
  const [draft, setDraft] = useState('')

  const load = () => {
    getTasks(MODE_STATUS[mode]).then((all) => {
      const filtered =
        mode === 'overdue'
          ? all.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'TERMINE')
          : all
      setTasks(filtered)
    }).catch(() => {})
  }
  useEffect(load, [mode])

  const add = async () => {
    if (!draft.trim()) return
    const created = await createTask({ title: draft.trim(), status: MODE_STATUS[mode] ?? 'A_FAIRE' })
    setTasks((t) => [{ ...created, source: 'PERSONAL' }, ...t])
    setDraft('')
  }

  const advance = async (task: PersonalTask) => {
    if (task.source === 'PROJECT') return
    const next: PersonalTaskStatus = task.status === 'A_FAIRE' ? 'EN_COURS' : 'TERMINE'
    await updateTask(task._id, { status: next })
    load()
  }

  return (
    <div className="widget">
      <div className="widget-title">
        {mode === 'overdue' ? <AlertTriangle size={15} /> : null} {MODE_TITLE[mode]}
        <span className="widget-count">{tasks.length}</span>
      </div>

      {mode !== 'overdue' && (
        <input
          className="widget-input"
          placeholder="Ajouter une tâche…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
      )}

      <ul className="widget-list">
        {tasks.map((t) => (
          <li key={t._id} className={`widget-task widget-task--${t.priority.toLowerCase()}`}>
            <button className="widget-task__check" onClick={() => advance(t)} aria-label="Avancer">
              {t.status === 'EN_COURS' ? <CheckCircle2 size={16} /> : <Circle size={16} />}
            </button>
            <span className="widget-task__title">{t.title}</span>
            {t.source === 'PROJECT' && t.project && (
              <Link to={`/admin/gestion`} className="widget-task__tag">{t.project.name}</Link>
            )}
          </li>
        ))}
        {tasks.length === 0 && <li className="widget-empty">Rien ici 🎉</li>}
      </ul>
    </div>
  )
}
