import React from 'react'
import type { ArrowRelance, ArrowSchool, ArrowSchoolFormData } from '../../../types/arrow.types'
import { ARROW_STATUSES, ARROW_SCHOOL_TYPES, ARROW_TEMPERATURES, ARROW_SOURCES, EMPTY_RELANCE } from './constants'

interface AdminUser { _id: string; name: string; email: string }

interface Props {
  form: ArrowSchoolFormData
  setForm: React.Dispatch<React.SetStateAction<ArrowSchoolFormData>>
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  loading: boolean
  editing: ArrowSchool | null
  admins: AdminUser[]
}

export default function SchoolFormPanel({ form, setForm, onSubmit, onCancel, loading, editing, admins }: Props) {
  const f = (field: keyof ArrowSchoolFormData) => (
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))
  )

  return (
    <div className="admin-panel" style={{ maxWidth: 560, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{editing ? 'Modifier l\'école' : 'Ajouter une école'}</h2>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>✕</button>
      </div>

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Infos école */}
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
          <legend style={{ fontSize: 13, color: 'var(--text-muted)', padding: '0 6px' }}>École</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input className="portal-input" placeholder="Nom de l'école *" value={form.name} onChange={f('name')} required />
            <select className="portal-input" value={form.schoolType} onChange={f('schoolType')}>
              {ARROW_SCHOOL_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input className="portal-input" placeholder="Ville" value={form.city} onChange={f('city')} />
              <input className="portal-input" placeholder="Région" value={form.region} onChange={f('region')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input className="portal-input" type="number" placeholder="Nb élèves (approx)" value={form.studentCount} onChange={f('studentCount')} />
              <input className="portal-input" type="email" placeholder="Email général école" value={form.emailGeneral} onChange={f('emailGeneral')} />
            </div>
          </div>
        </fieldset>

        {/* Contact référent */}
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
          <legend style={{ fontSize: 13, color: 'var(--text-muted)', padding: '0 6px' }}>Contact référent</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input className="portal-input" placeholder="Nom du contact" value={form.contactName} onChange={f('contactName')} />
              <input className="portal-input" placeholder="Poste (ex: Directeur)" value={form.contactRole} onChange={f('contactRole')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input className="portal-input" type="email" placeholder="Email contact" value={form.contactEmail} onChange={f('contactEmail')} />
              <input className="portal-input" placeholder="Téléphone" value={form.contactPhone} onChange={f('contactPhone')} />
            </div>
          </div>
        </fieldset>

        {/* Pipeline */}
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
          <legend style={{ fontSize: 13, color: 'var(--text-muted)', padding: '0 6px' }}>Prospection</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <select className="portal-input" value={form.status} onChange={f('status')}>
                {ARROW_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <select className="portal-input" value={form.temperature} onChange={f('temperature')}>
                {ARROW_TEMPERATURES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <select className="portal-input" value={form.source} onChange={f('source')}>
                <option value="">Source</option>
                {ARROW_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="portal-input" value={form.assignedTo} onChange={f('assignedTo')}>
                <option value="">Commercial assigné</option>
                {admins.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Prochain contact</label>
                <input className="portal-input" type="date" value={form.nextActionAt} onChange={f('nextActionAt')} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Dernier contact</label>
                <input className="portal-input" type="date" value={form.lastContactAt} onChange={f('lastContactAt')} />
              </div>
            </div>
            <textarea className="portal-input" placeholder="Notes..." value={form.notes} onChange={f('notes')} rows={3} style={{ resize: 'vertical' }} />
          </div>
        </fieldset>

        {/* Relances */}
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
          <legend style={{ fontSize: 13, color: 'var(--text-muted)', padding: '0 6px' }}>Relances (max 3)</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2].map(i => {
              const r: ArrowRelance = form.relances[i] ?? { ...EMPTY_RELANCE }
              const update = (patch: Partial<ArrowRelance>) => {
                const next = [0, 1, 2].map(j => form.relances[j] ?? { ...EMPTY_RELANCE })
                next[i] = { ...next[i], ...patch }
                setForm(prev => ({ ...prev, relances: next }))
              }
              return (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 20 }}>R{i + 1}</span>
                  <input
                    className="portal-input"
                    type="date"
                    value={r.date ? r.date.slice(0, 10) : ''}
                    onChange={e => update({ date: e.target.value || null })}
                    style={{ flex: '0 0 140px' }}
                  />
                  <input
                    className="portal-input"
                    placeholder="Note (optionnel)"
                    value={r.note}
                    onChange={e => update({ note: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input
                      type="checkbox"
                      checked={r.done}
                      onChange={e => update({ done: e.target.checked })}
                    />
                    Faite
                  </label>
                </div>
              )
            })}
          </div>
        </fieldset>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="portal-button" type="submit" disabled={loading} style={{ flex: 1 }}>
            {loading ? 'Enregistrement...' : editing ? 'Modifier' : 'Ajouter'}
          </button>
          <button type="button" onClick={onCancel} className="portal-button secondary">Annuler</button>
        </div>
      </form>
    </div>
  )
}
