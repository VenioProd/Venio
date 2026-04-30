import React, { useState } from 'react'
import type { ArrowSchool, ArrowSchoolFormData } from '../../../types/arrow.types'
import { ARROW_STATUSES, ARROW_SCHOOL_TYPES, ARROW_TEMPERATURES, ARROW_SOURCES, STATUS_MAP, TEMPERATURE_MAP } from './constants'

interface AdminUser { _id: string; name: string; email: string }

interface Props {
  school: ArrowSchool
  admins: AdminUser[]
  onClose: () => void
  onSave: (id: string, data: Partial<ArrowSchoolFormData>) => Promise<void>
  canManage: boolean
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{children}</div>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid rgba(14,165,233,0.2)' }}>{title}</div>
      {children}
    </div>
  )
}

export default function SchoolDetailModal({ school, admins, onClose, onSave, canManage }: Props) {
  const status = STATUS_MAP[school.status]
  const temp = TEMPERATURE_MAP[school.temperature]

  const [form, setForm] = useState({
    name: school.name,
    schoolType: school.schoolType,
    city: school.city,
    region: school.region,
    studentCount: school.studentCount !== null ? String(school.studentCount) : '',
    emailGeneral: school.emailGeneral,
    contactName: school.contactName,
    contactRole: school.contactRole,
    contactEmail: school.contactEmail,
    contactPhone: school.contactPhone,
    status: school.status,
    temperature: school.temperature,
    source: school.source,
    notes: school.notes,
    nextActionAt: school.nextActionAt ? school.nextActionAt.slice(0, 10) : '',
    lastContactAt: school.lastContactAt ? school.lastContactAt.slice(0, 10) : '',
    assignedTo: school.assignedTo?._id || '',
    relances: school.relances ?? [],
  })
  const [saving, setSaving] = useState(false)

  const f = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(school._id, form)
    setSaving(false)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '70px 16px 16px' }}
      onClick={onClose}>
      <div style={{ background: '#13151f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            {canManage
              ? <input value={form.name} onChange={f('name')} style={{ fontSize: 18, fontWeight: 700, background: 'none', border: 'none', color: 'var(--text-primary)', outline: 'none', width: '100%', padding: 0 }} />
              : <h2 style={{ margin: 0, fontSize: 18 }}>{school.name}</h2>
            }
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ background: `${status?.color}22`, color: status?.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{status?.label}</span>
              <span style={{ color: temp?.color, fontSize: 13 }}>{temp?.label}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 22, padding: 4, lineHeight: 1 }}>✕</button>
        </div>

        {/* Corps scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          <Section title="École">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Label>Type</Label>
                <select className="portal-input" value={form.schoolType} onChange={f('schoolType')} disabled={!canManage}>
                  {ARROW_SCHOOL_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Nb élèves</Label>
                <input className="portal-input" type="number" value={form.studentCount} onChange={f('studentCount')} readOnly={!canManage} />
              </div>
              <div>
                <Label>Ville</Label>
                <input className="portal-input" value={form.city} onChange={f('city')} readOnly={!canManage} />
              </div>
              <div>
                <Label>Région</Label>
                <input className="portal-input" value={form.region} onChange={f('region')} readOnly={!canManage} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Label>Email général</Label>
                <input className="portal-input" type="email" value={form.emailGeneral} onChange={f('emailGeneral')} readOnly={!canManage} />
              </div>
            </div>
          </Section>

          <Section title="Contact référent">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Label>Nom</Label>
                <input className="portal-input" value={form.contactName} onChange={f('contactName')} readOnly={!canManage} />
              </div>
              <div>
                <Label>Poste</Label>
                <input className="portal-input" value={form.contactRole} onChange={f('contactRole')} readOnly={!canManage} />
              </div>
              <div>
                <Label>Email</Label>
                <input className="portal-input" type="email" value={form.contactEmail} onChange={f('contactEmail')} readOnly={!canManage} />
              </div>
              <div>
                <Label>Téléphone</Label>
                <input className="portal-input" value={form.contactPhone} onChange={f('contactPhone')} readOnly={!canManage} />
              </div>
            </div>
          </Section>

          <Section title="Prospection">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Label>Statut</Label>
                <select className="portal-input" value={form.status} onChange={f('status')} disabled={!canManage}>
                  {ARROW_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Température</Label>
                <select className="portal-input" value={form.temperature} onChange={f('temperature')} disabled={!canManage}>
                  {ARROW_TEMPERATURES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Source</Label>
                <select className="portal-input" value={form.source} onChange={f('source')} disabled={!canManage}>
                  <option value="">—</option>
                  {ARROW_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label>Commercial assigné</Label>
                <select className="portal-input" value={form.assignedTo} onChange={f('assignedTo')} disabled={!canManage}>
                  <option value="">Non assigné</option>
                  {admins.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Prochain contact</Label>
                <input className="portal-input" type="date" value={form.nextActionAt} onChange={f('nextActionAt')} readOnly={!canManage} />
              </div>
              <div>
                <Label>Dernier contact</Label>
                <input className="portal-input" type="date" value={form.lastContactAt} onChange={f('lastContactAt')} readOnly={!canManage} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Label>Notes</Label>
                <textarea className="portal-input" value={form.notes} onChange={f('notes')} rows={3} style={{ resize: 'vertical' }} readOnly={!canManage} />
              </div>
            </div>
          </Section>

          {/* Relances en lecture */}
          {(school.relances ?? []).some(r => r.date) && (
            <Section title="Relances">
              {[0, 1, 2].map(i => {
                const r = school.relances[i]
                if (!r?.date) return null
                const isLate = !r.done && new Date(r.date) < new Date()
                const color = r.done ? '#22c55e' : isLate ? '#ef4444' : '#f59e0b'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, border: `1.5px solid ${color}`, color, flexShrink: 0 }}>
                      {r.done ? '✓' : i + 1}
                    </span>
                    <span style={{ fontSize: 13, minWidth: 90 }}>{new Date(r.date).toLocaleDateString('fr-FR')}</span>
                    <span style={{ fontSize: 12, color }}>{r.done ? 'Faite' : isLate ? 'En retard' : 'Planifiée'}</span>
                    {r.note && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— {r.note}</span>}
                  </div>
                )
              })}
            </Section>
          )}
        </div>

        {/* Footer */}
        {canManage && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 10, flexShrink: 0 }}>
            <button className="portal-button" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
              {saving ? 'Enregistrement...' : 'Sauvegarder'}
            </button>
            <button className="portal-button secondary" onClick={onClose} style={{ padding: '0 20px' }}>Annuler</button>
          </div>
        )}
      </div>
    </div>
  )
}
