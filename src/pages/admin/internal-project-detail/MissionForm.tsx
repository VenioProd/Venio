import type { FormEvent } from 'react'
import type { Member, MissionFormState } from './types'

interface Props {
  form: MissionFormState
  setForm: (updater: (f: MissionFormState) => MissionFormState) => void
  members: Member[]
  saving: boolean
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
}

export default function MissionForm({ form, setForm, members, saving, onSubmit, onCancel }: Props) {
  return (
    <form
      onSubmit={onSubmit}
      style={{
        marginBottom: 16,
        padding: '16px',
        borderRadius: 10,
        background: 'rgba(204, 255, 0, 0.04)',
        border: '1px solid rgba(204, 255, 0, 0.15)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="portal-label">Titre *</label>
          <input
            className="portal-input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Ex: Créer les maquettes landing page"
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="portal-label">Description</label>
          <textarea
            className="portal-input"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            style={{ resize: 'vertical' }}
            placeholder="Détails de la mission..."
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="portal-label">
            Assigner à *{' '}
            <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 11 }}>(plusieurs possibles)</span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {members.map((a) => {
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
                    transition: 'all .15s',
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: selected ? 'rgba(16,185,129,0.2)' : 'rgba(165,180,207,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {a.name[0]?.toUpperCase()}
                  </div>
                  {a.name}
                  {selected && <span style={{ fontSize: 10 }}>✓</span>}
                </button>
              )
            })}
          </div>
          {form.assignedTo.length > 0 && (
            <div style={{ fontSize: 11, color: '#6ee7b7', marginTop: 4 }}>
              {form.assignedTo.length} personne{form.assignedTo.length > 1 ? 's' : ''} sélectionnée
              {form.assignedTo.length > 1 ? 's' : ''}
            </div>
          )}
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
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="portal-button" type="submit" disabled={saving} style={{ fontSize: 13 }}>
          {saving ? 'Création...' : 'Créer la mission'}
        </button>
        <button className="portal-button secondary" type="button" onClick={onCancel} style={{ fontSize: 13 }}>
          Annuler
        </button>
      </div>
    </form>
  )
}
