import { type FormEvent } from 'react'
import {
  ENTITIES,
  POLES,
  STATUS_LABELS,
  type Member,
  type Project,
  type ProjectFormState,
} from './constants'

interface Props {
  show: boolean
  editTarget: Project | null
  form: ProjectFormState
  setForm: (updater: (f: ProjectFormState) => ProjectFormState) => void
  admins: Member[]
  saving: boolean
  onSubmit: (e: FormEvent) => void | Promise<void>
  onCancel: () => void
  onTogglePole: (pole: string) => void
  onToggleMember: (id: string) => void
}

export default function ProjectFormCard({
  show,
  editTarget,
  form,
  setForm,
  admins,
  saving,
  onSubmit,
  onCancel,
  onTogglePole,
  onToggleMember,
}: Props) {
  if (!show) return null
  return (
    <div className="portal-card" style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
        {editTarget ? 'Modifier le projet' : 'Nouveau projet interne'}
      </h2>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">Nom du projet *</label>
            <input
              className="portal-input"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Plateforme Arrow"
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">Description</label>
            <textarea
              className="portal-input"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              style={{ resize: 'vertical' }}
              placeholder="Objectif, contexte..."
            />
          </div>
          <div>
            <label className="portal-label">Entité</label>
            <select
              className="portal-input"
              value={form.entity}
              onChange={e => setForm(f => ({ ...f, entity: e.target.value }))}
            >
              {ENTITIES.map(e => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="portal-label">Statut</label>
            <select
              className="portal-input"
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
            >
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="portal-label">Priorité</label>
            <select
              className="portal-input"
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
            >
              <option value="BASSE">Basse</option>
              <option value="NORMALE">Normale</option>
              <option value="HAUTE">Haute</option>
              <option value="URGENTE">Urgente</option>
            </select>
          </div>
          <div>
            <label className="portal-label">Tags (virgule)</label>
            <input
              className="portal-input"
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="design, refonte, v2..."
            />
          </div>
          {/* Poles */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">Pôles concernés</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {POLES.map(pole => (
                <button
                  key={pole}
                  type="button"
                  onClick={() => onTogglePole(pole)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    border: '1px solid',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: form.poles.includes(pole)
                      ? 'rgba(14, 165, 233, 0.2)'
                      : 'transparent',
                    borderColor: form.poles.includes(pole) ? '#0ea5e9' : 'var(--border)',
                    color: form.poles.includes(pole) ? '#38bdf8' : 'var(--text-secondary)',
                    transition: 'all .15s',
                  }}
                >
                  {pole}
                </button>
              ))}
            </div>
          </div>
          {/* Members */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">Membres assignés</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {admins.map(admin => (
                <button
                  key={admin._id}
                  type="button"
                  onClick={() => onToggleMember(admin._id)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    border: '1px solid',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: form.members.includes(admin._id)
                      ? 'rgba(16, 185, 129, 0.2)'
                      : 'transparent',
                    borderColor: form.members.includes(admin._id) ? '#10b981' : 'var(--border)',
                    color: form.members.includes(admin._id) ? '#6ee7b7' : 'var(--text-secondary)',
                    transition: 'all .15s',
                  }}
                >
                  {admin.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button className="portal-button" type="submit" disabled={saving}>
            {saving
              ? 'Enregistrement...'
              : editTarget
                ? 'Mettre à jour'
                : 'Créer le projet'}
          </button>
          <button className="portal-button secondary" type="button" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  )
}
