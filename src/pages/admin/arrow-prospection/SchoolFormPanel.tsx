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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, marginTop: 4 }}>
      {children}
    </div>
  )
}

export default function SchoolFormPanel({ form, setForm, onSubmit, onCancel, loading, editing, admins }: Props) {
  const f = (field: keyof ArrowSchoolFormData) => (
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))
  )

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100 }}
      />

      {/* Panneau latéral */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 500, maxWidth: '100vw',
        background: '#13151f',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        zIndex: 1101, display: 'flex', flexDirection: 'column',
        boxShadow: '-12px 0 48px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            {editing ? 'Modifier l\'école' : 'Ajouter une école'}
          </h2>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {/* Corps scrollable */}
        <form onSubmit={onSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* École */}
          <div>
            <SectionTitle>École</SectionTitle>
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
          </div>

          {/* Contact référent */}
          <div>
            <SectionTitle>Contact référent</SectionTitle>
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
          </div>

          {/* Prospection */}
          <div>
            <SectionTitle>Prospection</SectionTitle>
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
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Prochain contact</div>
                  <input className="portal-input" type="date" value={form.nextActionAt} onChange={f('nextActionAt')} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Dernier contact</div>
                  <input className="portal-input" type="date" value={form.lastContactAt} onChange={f('lastContactAt')} />
                </div>
              </div>
              <textarea className="portal-input" placeholder="Notes..." value={form.notes} onChange={f('notes')} rows={3} style={{ resize: 'vertical' }} />
            </div>
          </div>

          {/* Relances */}
          <div>
            <SectionTitle>Relances (max 3)</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[0, 1, 2].map(i => {
                const r: ArrowRelance = form.relances[i] ?? { ...EMPTY_RELANCE }
                const update = (patch: Partial<ArrowRelance>) => {
                  const next = [0, 1, 2].map(j => form.relances[j] ?? { ...EMPTY_RELANCE })
                  next[i] = { ...next[i], ...patch }
                  setForm(prev => ({ ...prev, relances: next }))
                }
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 22 }}>R{i + 1}</span>
                    <input
                      className="portal-input"
                      type="date"
                      value={r.date ? r.date.slice(0, 10) : ''}
                      onChange={e => update({ date: e.target.value || null })}
                      style={{ flex: '0 0 145px' }}
                    />
                    <input
                      className="portal-input"
                      placeholder="Note"
                      value={r.note}
                      onChange={e => update({ note: e.target.value })}
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: r.done ? '#22c55e' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={r.done} onChange={e => update({ done: e.target.checked })} />
                      Faite
                    </label>
                  </div>
                )
              })}
            </div>
          </div>

        </form>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 10, flexShrink: 0, background: '#13151f' }}>
          <button className="portal-button" type="submit" form="school-form" disabled={loading} style={{ flex: 1 }}
            onClick={onSubmit as any}>
            {loading ? 'Enregistrement...' : editing ? 'Modifier' : 'Ajouter'}
          </button>
          <button type="button" onClick={onCancel} className="portal-button secondary" style={{ flex: '0 0 auto', padding: '0 20px' }}>
            Annuler
          </button>
        </div>
      </div>
    </>
  )
}
