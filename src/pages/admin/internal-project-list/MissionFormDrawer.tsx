/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FormEvent } from 'react'
import type { Project, Member } from './types'

interface MissionFormState {
  projectId: string
  title: string
  description: string
  assignedTo: string[]
  dueDate: string
}

interface Props {
  form: MissionFormState
  setForm: (updater: (f: MissionFormState) => MissionFormState) => void
  projects: Project[]
  admins: Member[]
  saving: boolean
  onClose: () => void
  onSubmit: (e: FormEvent) => void
}

export default function MissionFormDrawer({ form, setForm, projects, admins, saving, onClose, onSubmit }: Props) {
  return (
    <div className="portal-card" style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
        Nouvelle mission interne
      </h2>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="portal-label">Projet *</label>
            <select className="portal-input" value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))} required>
              <option value="">— Choisir —</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.entity} · {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="portal-label">Deadline</label>
            <input
              type="date"
              className="portal-input"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">Titre *</label>
            <input
              className="portal-input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ex: Refonte landing page"
              required
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">Description</label>
            <textarea
              className="portal-input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Détails de la mission..."
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">Assigner à</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {admins.map((a) => {
                const selected = form.assignedTo.includes(a._id)
                return (
                  <button
                    key={a._id}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        assignedTo: selected ? f.assignedTo.filter((i) => i !== a._id) : [...f.assignedTo, a._id],
                      }))
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 20,
                      border: `1px solid ${selected ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      background: selected ? 'rgba(16,185,129,0.12)' : 'transparent',
                      color: selected ? '#6ee7b7' : 'var(--text-secondary)',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {a.name}
                    {selected && <span style={{ fontSize: 10 }}>✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="portal-button" type="submit" disabled={saving}>
            {saving ? 'Création...' : 'Créer la mission'}
          </button>
          <button className="portal-button secondary" type="button" onClick={onClose}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  )
}
