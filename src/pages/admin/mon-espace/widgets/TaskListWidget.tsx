import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Circle, CheckCircle2, AlertTriangle } from 'lucide-react'
import { getTasks, createTask, updateTask } from '../../../../services/workspace'
import type { PersonalTask, PersonalTaskStatus } from '../../../../types/workspace.types'
import { useI18n } from '../../../../context/I18nContext'
import type { MessageKey } from '../../../../i18n'

type Mode = 'todo' | 'doing' | 'overdue'

const MODE_STATUS: Record<Mode, PersonalTaskStatus | undefined> = {
  todo: 'A_FAIRE',
  doing: 'EN_COURS',
  overdue: undefined,
}
const MODE_TITLE: Record<Mode, MessageKey> = {
  todo: 'adminAccess.widgets.taskTodo',
  doing: 'adminAccess.widgets.taskDoing',
  overdue: 'adminAccess.widgets.taskOverdue',
}

export default function TaskListWidget({ mode }: { mode: Mode }) {
  const { t: tr } = useI18n()
  const [tasks, setTasks] = useState<PersonalTask[]>([])
  const [draft, setDraft] = useState('')

  const load = () => {
    getTasks(MODE_STATUS[mode])
      .then((all) => {
        const filtered =
          mode === 'overdue'
            ? all.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'TERMINE')
            : all
        setTasks(filtered)
      })
      .catch(() => {})
  }
  useEffect(load, [mode])

  const add = async () => {
    if (!draft.trim()) return
    try {
      const created = await createTask({ title: draft.trim(), status: MODE_STATUS[mode] ?? 'A_FAIRE' })
      setTasks((t) => [{ ...created, source: 'PERSONAL' }, ...t])
      setDraft('')
    } catch {
      /* ignore */
    }
  }

  const advance = async (task: PersonalTask) => {
    if (task.source === 'PROJECT') return
    if (task.status === 'TERMINE') return
    const next: PersonalTaskStatus = task.status === 'A_FAIRE' ? 'EN_COURS' : 'TERMINE'
    await updateTask(task._id, { status: next })
    load()
  }

  return (
    <div className="widget">
      <div className="widget-title">
        {mode === 'overdue' ? <AlertTriangle size={15} /> : null} {tr(MODE_TITLE[mode])}
        <span className="widget-count">{tasks.length}</span>
      </div>

      {mode !== 'overdue' && (
        <input
          className="widget-input"
          placeholder={tr('adminAccess.widgets.taskPlaceholder')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
      )}

      <ul className="widget-list">
        {tasks.map((t) => (
          <li key={t._id} className={`widget-task widget-task--${t.priority.toLowerCase()}`}>
            <button
              className="widget-task__check"
              onClick={() => advance(t)}
              aria-label={tr('adminAccess.widgets.taskAdvance')}
            >
              {t.status === 'EN_COURS' ? <CheckCircle2 size={16} /> : <Circle size={16} />}
            </button>
            <span className="widget-task__title">{t.title}</span>
            {t.source === 'PROJECT' && t.project && (
              <Link to={`/admin/projets/clients`} className="widget-task__tag">
                {t.project.name}
              </Link>
            )}
          </li>
        ))}
        {tasks.length === 0 && <li className="widget-empty">{tr('adminAccess.widgets.taskEmpty')}</li>}
      </ul>
    </div>
  )
}
