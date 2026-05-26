import { useCallback, useEffect, useState } from 'react'
import {
  listAssignments,
  formatDate,
  ASSIGNMENT_KIND_LABEL,
  type EducationAssignment,
  type EducationAssignmentStatus,
  type EducationClass,
} from '@/services/education'
import AssignmentDetailDrawer from './AssignmentDetailDrawer'

export default function AssignmentsView({
  classes,
  onChanged,
  incomingOpenId,
  onCloseIncomingOpen,
  onStartCorrection,
}: {
  classes: EducationClass[]
  onChanged: () => void
  incomingOpenId?: string | null
  onCloseIncomingOpen?: () => void
  onStartCorrection?: (id: string) => void
}) {
  const [filterClass, setFilterClass] = useState<string>('')
  const [items, setItems] = useState<EducationAssignment[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  useEffect(() => {
    if (incomingOpenId) {
      setOpenId(incomingOpenId)
      onCloseIncomingOpen?.()
    }
  }, [incomingOpenId, onCloseIncomingOpen])

  const refresh = useCallback(async () => {
    const r = await listAssignments(filterClass ? { classId: filterClass } : {})
    setItems(r.assignments)
  }, [filterClass])

  useEffect(() => {
    refresh()
  }, [refresh])

  const cols: { status: EducationAssignmentStatus; label: string }[] = [
    { status: 'DRAFT', label: 'Brouillon' },
    { status: 'OUVERT', label: 'Ouvert' },
    { status: 'EN_CORRECTION', label: 'En correction' },
    { status: 'CLOS', label: 'Clos' },
  ]

  return (
    <div>
      <div className="edu-row between">
        <h1 className="edu-h1">Devoirs & projets</h1>
        <select
          className="edu-select"
          style={{ width: 220 }}
          value={filterClass}
          onChange={e => setFilterClass(e.target.value)}
        >
          <option value="">Toutes les classes</option>
          {classes.map(c => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <p className="edu-sub">
        {items.length} devoir{items.length > 1 ? 's' : ''}
      </p>
      {items.length === 0 ? (
        <div className="edu-empty">
          <div className="edu-empty-icon">📋</div>
          <div>
            {filterClass ? 'Aucun devoir pour cette classe.' : 'Aucun devoir encore.'}
          </div>
          <div className="edu-empty-sub">
            Crée un devoir depuis l'onglet « Devoirs » d'une classe pour démarrer le kanban.
          </div>
        </div>
      ) : (
        <div className="edu-kanban">
          {cols.map(col => {
            const list = items.filter(i => i.status === col.status)
            return (
              <div key={col.status} className="edu-kanban-col">
                <div className="edu-kanban-col-head">
                  <span>{col.label}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>{list.length}</span>
                </div>
                {list.length === 0 && <div className="edu-kanban-empty">—</div>}
                {list.map(a => {
                  const cls = typeof a.classId === 'string' ? null : a.classId
                  return (
                    <div
                      key={a._id}
                      className="edu-kanban-card"
                      onClick={() => setOpenId(a._id)}
                    >
                      <div className="edu-kanban-card-title">{a.title}</div>
                      <div className="edu-kanban-card-meta">
                        {cls && <span style={{ color: cls.color }}>● </span>}
                        {ASSIGNMENT_KIND_LABEL[a.kind]}
                        {a.deadline && ` · ${formatDate(a.deadline)}`}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
      {openId && (
        <AssignmentDetailDrawer
          assignmentId={openId}
          onClose={() => setOpenId(null)}
          onChanged={async () => {
            await refresh()
            onChanged()
          }}
          onStartCorrection={onStartCorrection}
        />
      )}
    </div>
  )
}
