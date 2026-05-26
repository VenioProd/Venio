import { useCallback, useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
  listAssignments,
  createAssignment,
  formatDate,
  ASSIGNMENT_STATUS_LABEL,
  ASSIGNMENT_KIND_LABEL,
  type EducationAssignment,
  type EducationAssignmentStatus,
} from '@/services/education'
import AssignmentDetailDrawer from './AssignmentDetailDrawer'

export default function AssignmentsTab({
  classId,
  onChanged,
}: {
  classId: string
  onChanged: () => void
}) {
  const [items, setItems] = useState<EducationAssignment[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const refresh = useCallback(async () => {
    const r = await listAssignments({ classId })
    setItems(r.assignments)
  }, [classId])
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
      <div className="edu-row between" style={{ marginBottom: 12 }}>
        <strong>
          {items.length} devoir{items.length > 1 ? 's' : ''}
        </strong>
        <button className="edu-btn" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> Nouveau devoir
        </button>
      </div>

      <div className="edu-kanban">
        {cols.map(col => {
          const list = items.filter(i => i.status === col.status)
          return (
            <div key={col.status} className="edu-kanban-col">
              <div className="edu-kanban-col-head">
                <span>{col.label}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>{list.length}</span>
              </div>
              {list.map(a => (
                <div
                  key={a._id}
                  className="edu-kanban-card"
                  onClick={() => setOpenId(a._id)}
                >
                  <div className="edu-kanban-card-title">{a.title}</div>
                  <div className="edu-kanban-card-meta">
                    {ASSIGNMENT_KIND_LABEL[a.kind]}
                    {a.deadline && ` · ${formatDate(a.deadline)}`}
                  </div>
                </div>
              ))}
              {list.length === 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.3)',
                    textAlign: 'center',
                    padding: '12px 0',
                  }}
                >
                  —
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showCreate && (
        <AssignmentForm
          classId={classId}
          onClose={() => setShowCreate(false)}
          onSaved={async () => {
            setShowCreate(false)
            await refresh()
            onChanged()
          }}
        />
      )}
      {openId && (
        <AssignmentDetailDrawer
          assignmentId={openId}
          onClose={() => setOpenId(null)}
          onChanged={async () => {
            await refresh()
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function AssignmentForm({
  classId,
  onClose,
  onSaved,
}: {
  classId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    title: '',
    kind: 'DEVOIR' as EducationAssignment['kind'],
    instructions: '',
    deadline: '',
    maxGrade: 20,
    weight: 1,
    status: 'OUVERT' as EducationAssignmentStatus,
  })
  const [saving, setSaving] = useState(false)
  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer" style={{ width: 'min(560px, 92vw)' }}>
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
            Nouveau devoir
          </h2>
          <button className="edu-btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="edu-drawer-body">
          <div className="edu-form-group">
            <label>Titre</label>
            <input
              className="edu-input"
              autoFocus
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>Type</label>
              <select
                className="edu-select"
                value={form.kind}
                onChange={e =>
                  setForm({ ...form, kind: e.target.value as EducationAssignment['kind'] })
                }
              >
                {Object.entries(ASSIGNMENT_KIND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="edu-form-group">
              <label>Statut</label>
              <select
                className="edu-select"
                value={form.status}
                onChange={e =>
                  setForm({ ...form, status: e.target.value as EducationAssignmentStatus })
                }
              >
                {Object.entries(ASSIGNMENT_STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>Échéance</label>
              <input
                type="datetime-local"
                className="edu-input"
                value={form.deadline}
                onChange={e => setForm({ ...form, deadline: e.target.value })}
              />
            </div>
            <div className="edu-form-group">
              <label>Note max</label>
              <input
                type="number"
                className="edu-input"
                value={form.maxGrade}
                onChange={e => setForm({ ...form, maxGrade: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="edu-form-group">
            <label>Consignes</label>
            <textarea
              className="edu-textarea"
              value={form.instructions}
              onChange={e => setForm({ ...form, instructions: e.target.value })}
            />
          </div>
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="edu-btn"
            disabled={!form.title.trim() || saving}
            onClick={async () => {
              setSaving(true)
              try {
                await createAssignment({
                  classId,
                  title: form.title,
                  kind: form.kind,
                  status: form.status,
                  instructions: form.instructions,
                  deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
                  maxGrade: form.maxGrade,
                  weight: form.weight,
                })
                onSaved()
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </>
  )
}
