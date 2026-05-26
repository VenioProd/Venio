import type { FormEvent } from 'react'

interface ProjectFormState {
  key: string
  name: string
  description: string
  color: string
}

interface Props {
  form: ProjectFormState
  setForm: (updater: (f: ProjectFormState) => ProjectFormState) => void
  error: string | null
  saving: boolean
  onSubmit: (e: FormEvent) => void
  onClose: () => void
}

export default function ProjectCreateModal({ form, setForm, error, saving, onSubmit, onClose }: Props) {
  return (
    <div className="dev-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <form className="dev-modal" onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <h2>Nouveau projet de développement</h2>
        <div className="dev-modal-field">
          <label>Clé (préfixe identifiant, 2-8 lettres majuscules) *</label>
          <input
            value={form.key}
            onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toUpperCase() }))}
            placeholder="ARROW, VEN…"
            maxLength={8}
            required
          />
        </div>
        <div className="dev-modal-field">
          <label>Nom *</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Arrow SaaS, Site Venio…"
            required
          />
        </div>
        <div className="dev-modal-field">
          <label>Description</label>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
        </div>
        <div className="dev-modal-field">
          <label>Couleur</label>
          <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
        </div>
        {error && <div style={{ color: '#fca5a5', fontSize: 12.5, marginTop: 6 }}>{error}</div>}
        <div className="dev-modal-actions">
          <button type="button" className="dev-btn subtle" onClick={onClose}>Annuler</button>
          <button type="submit" className="dev-btn primary" disabled={saving}>
            {saving ? 'Création…' : 'Créer le projet'}
          </button>
        </div>
      </form>
    </div>
  )
}
