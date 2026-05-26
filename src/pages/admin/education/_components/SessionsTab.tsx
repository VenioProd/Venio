import { useCallback, useEffect, useState } from 'react'
import { Plus, X, ChevronRight } from 'lucide-react'
import {
  listSessions,
  createSession,
  formatDate,
  SESSION_STATUS_LABEL,
  type EducationSession,
} from '@/services/education'
import { SessionDetailDrawer } from '../SessionDetailDrawer'

export default function SessionsTab({
  classId,
  onChanged,
}: {
  classId: string
  onChanged: () => void
}) {
  const [sessions, setSessions] = useState<EducationSession[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const r = await listSessions({ classId })
    setSessions(r.sessions)
  }, [classId])
  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div>
      <div className="edu-row between" style={{ marginBottom: 12 }}>
        <strong>
          {sessions.length} séance{sessions.length > 1 ? 's' : ''}
        </strong>
        <button className="edu-btn" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> Nouvelle séance
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="edu-empty">Aucune séance planifiée.</div>
      ) : (
        <table className="edu-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Séance</th>
              <th>Statut</th>
              <th>Présence</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => {
              const present = s.attendance.filter(a => a.state === 'PRESENT').length
              const total = s.attendance.length
              return (
                <tr
                  key={s._id}
                  onClick={() => setOpenSessionId(s._id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>{formatDate(s.date, true)}</td>
                  <td>
                    <strong>{s.title}</strong>
                    {s.theme && (
                      <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>
                        {s.theme}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="edu-pill">{SESSION_STATUS_LABEL[s.status]}</span>
                  </td>
                  <td>
                    {present} / {total}
                  </td>
                  <td>
                    <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {showCreate && (
        <SessionForm
          classId={classId}
          onClose={() => setShowCreate(false)}
          onSaved={async () => {
            setShowCreate(false)
            await refresh()
            onChanged()
          }}
        />
      )}
      {openSessionId && (
        <SessionDetailDrawer
          sessionId={openSessionId}
          onClose={() => setOpenSessionId(null)}
          onChanged={async () => {
            await refresh()
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function SessionForm({
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
    theme: '',
    date: new Date().toISOString().slice(0, 16),
    durationMin: 120,
    location: '',
    agenda: '',
  })
  const [saving, setSaving] = useState(false)
  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer" style={{ width: 'min(560px, 92vw)' }}>
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
            Nouvelle séance
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
              <label>Date & heure</label>
              <input
                type="datetime-local"
                className="edu-input"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="edu-form-group">
              <label>Durée (min)</label>
              <input
                type="number"
                className="edu-input"
                value={form.durationMin}
                onChange={e =>
                  setForm({ ...form, durationMin: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <div className="edu-form-group">
            <label>Thème</label>
            <input
              className="edu-input"
              value={form.theme}
              onChange={e => setForm({ ...form, theme: e.target.value })}
            />
          </div>
          <div className="edu-form-group">
            <label>Lieu</label>
            <input
              className="edu-input"
              value={form.location}
              onChange={e => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <div className="edu-form-group">
            <label>Déroulé</label>
            <textarea
              className="edu-textarea"
              value={form.agenda}
              onChange={e => setForm({ ...form, agenda: e.target.value })}
            />
          </div>
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="edu-btn"
            disabled={!form.title.trim() || !form.date || saving}
            onClick={async () => {
              setSaving(true)
              try {
                await createSession({
                  classId,
                  title: form.title,
                  theme: form.theme,
                  date: new Date(form.date).toISOString(),
                  durationMin: form.durationMin,
                  location: form.location,
                  agenda: form.agenda,
                })
                onSaved()
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Création…' : 'Créer la séance'}
          </button>
        </div>
      </div>
    </>
  )
}
