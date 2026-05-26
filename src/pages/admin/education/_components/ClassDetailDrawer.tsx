import { useCallback, useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import {
  getClass,
  deleteClass,
  formatDate,
  CLASS_STATUS_LABEL,
  type EducationClass,
  type EducationTemplate,
} from '@/services/education'
import ClassFormDrawer from './ClassFormDrawer'
import StudentsTab from './StudentsTab'
import SessionsTab from './SessionsTab'
import AssignmentsTab from './AssignmentsTab'
import NotesView from './NotesView'
import { Kpi } from './shared'

type ClassTab = 'overview' | 'students' | 'sessions' | 'assignments' | 'notes'

interface Props {
  classId: string
  onClose: () => void
  onChanged: () => void
  templates?: EducationTemplate[]
  onTemplatesChanged?: () => void
}

export default function ClassDetailDrawer({
  classId,
  onClose,
  onChanged,
  templates,
  onTemplatesChanged,
}: Props) {
  const [klass, setKlass] = useState<EducationClass | null>(null)
  const [stats, setStats] = useState<{
    studentCount: number
    sessionCount: number
    assignmentCount: number
    openAssignments: number
  } | null>(null)
  const [tab, setTab] = useState<ClassTab>('overview')
  const [editing, setEditing] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const r = await getClass(classId)
      setKlass(r.class)
      setStats(r.stats)
    } catch {
      onClose()
    }
  }, [classId, onClose])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (!klass) return null

  async function handleDelete() {
    if (
      !confirm(
        `Supprimer la classe "${klass!.name}" ? Les étudiants, séances et devoirs liés seront aussi soft-supprimés.`,
      )
    )
      return
    await deleteClass(classId)
    onChanged()
    onClose()
  }

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <div className="edu-row" style={{ gap: 10 }}>
            <span
              className="edu-side-dot"
              style={{ background: klass.color, width: 14, height: 14, borderRadius: 4 }}
            />
            <div>
              <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
                {klass.name}
              </h2>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                {[klass.school, klass.level, klass.program].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
          </div>
          <div className="edu-row" style={{ gap: 6 }}>
            <button className="edu-btn ghost" onClick={() => setEditing(true)}>
              Modifier
            </button>
            <button className="edu-btn-icon" onClick={handleDelete} title="Supprimer">
              <Trash2 size={16} />
            </button>
            <button className="edu-btn-icon" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div style={{ padding: '0 24px' }}>
          <div className="edu-tabs">
            {(
              [
                ['overview', "Vue d'ensemble"],
                ['students', 'Étudiants'],
                ['sessions', 'Séances'],
                ['assignments', 'Devoirs'],
                ['notes', 'Notes'],
              ] as Array<[ClassTab, string]>
            ).map(([k, label]) => (
              <button
                key={k}
                className={`edu-tab ${tab === k ? 'active' : ''}`}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="edu-drawer-body">
          {tab === 'overview' && <OverviewTab klass={klass} stats={stats} />}
          {tab === 'students' && (
            <StudentsTab
              classId={classId}
              onChanged={() => {
                refresh()
                onChanged()
              }}
            />
          )}
          {tab === 'sessions' && (
            <SessionsTab
              classId={classId}
              onChanged={() => {
                refresh()
                onChanged()
              }}
            />
          )}
          {tab === 'assignments' && (
            <AssignmentsTab
              classId={classId}
              onChanged={() => {
                refresh()
                onChanged()
              }}
            />
          )}
          {tab === 'notes' && (
            <NotesView
              classes={[]}
              fixedLink={{ type: 'class', refId: classId }}
              templates={templates}
              onTemplatesChanged={onTemplatesChanged}
            />
          )}
        </div>
      </div>

      {editing && (
        <ClassFormDrawer
          initial={klass}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false)
            await refresh()
            onChanged()
          }}
        />
      )}
    </>
  )
}

function OverviewTab({
  klass,
  stats,
}: {
  klass: EducationClass
  stats: {
    studentCount: number
    sessionCount: number
    assignmentCount: number
    openAssignments: number
  } | null
}) {
  return (
    <div>
      <div className="edu-kpi-grid">
        <Kpi label="Étudiants" value={stats?.studentCount ?? '—'} />
        <Kpi label="Séances" value={stats?.sessionCount ?? '—'} />
        <Kpi label="Devoirs" value={stats?.assignmentCount ?? '—'} />
        <Kpi label="Devoirs ouverts" value={stats?.openAssignments ?? '—'} />
      </div>
      <h2 className="edu-h2">Période & volume</h2>
      <div style={{ fontSize: 13.5 }}>
        <p>
          Période : {klass.period.start ? formatDate(klass.period.start) : '—'} →{' '}
          {klass.period.end ? formatDate(klass.period.end) : '—'}
        </p>
        <p>Heures hebdomadaires : {klass.weeklyHours ?? '—'} h</p>
        <p>Volume total : {klass.totalHours ?? '—'} h</p>
        <p>
          Statut : <span className="edu-pill">{CLASS_STATUS_LABEL[klass.status]}</span>
        </p>
      </div>
      {klass.notes && (
        <>
          <h2 className="edu-h2">Notes internes</h2>
          <div
            style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, color: 'rgba(255,255,255,0.85)' }}
          >
            {klass.notes}
          </div>
        </>
      )}
    </div>
  )
}
