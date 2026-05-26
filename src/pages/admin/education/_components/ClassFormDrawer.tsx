import { useState } from 'react'
import { X } from 'lucide-react'
import {
  createClass,
  updateClass,
  CLASS_STATUS_LABEL,
  CLASS_COLOR_PALETTE,
  type EducationClass,
} from '@/services/education'

export default function ClassFormDrawer({
  initial,
  onClose,
  onSaved,
}: {
  initial?: EducationClass
  onClose: () => void
  onSaved: (c: EducationClass) => void
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    school: initial?.school ?? '',
    level: initial?.level ?? '',
    program: initial?.program ?? '',
    color: initial?.color ?? CLASS_COLOR_PALETTE[0],
    weeklyHours: initial?.weeklyHours ?? null,
    notes: initial?.notes ?? '',
    status: initial?.status ?? 'ACTIVE',
    periodStart: initial?.period?.start?.slice(0, 10) ?? '',
    periodEnd: initial?.period?.end?.slice(0, 10) ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim(),
        school: form.school.trim(),
        level: form.level.trim(),
        program: form.program.trim(),
        color: form.color,
        weeklyHours: form.weeklyHours,
        notes: form.notes,
        status: form.status,
        period: {
          start: form.periodStart || null,
          end: form.periodEnd || null,
        },
      }
      const r = initial ? await updateClass(initial._id, payload) : await createClass(payload)
      onSaved(r.class)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
            {initial ? 'Modifier la classe' : 'Nouvelle classe'}
          </h2>
          <button className="edu-btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="edu-drawer-body">
          <div className="edu-form-group">
            <label>Nom de la classe</label>
            <input
              className="edu-input"
              autoFocus
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Ex. BTS Communication 1A"
            />
          </div>
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>École</label>
              <input
                className="edu-input"
                value={form.school}
                onChange={e => setForm({ ...form, school: e.target.value })}
              />
            </div>
            <div className="edu-form-group">
              <label>Niveau</label>
              <input
                className="edu-input"
                value={form.level}
                onChange={e => setForm({ ...form, level: e.target.value })}
                placeholder="BAC+1, M1…"
              />
            </div>
          </div>
          <div className="edu-form-group">
            <label>Programme / matière</label>
            <input
              className="edu-input"
              value={form.program}
              onChange={e => setForm({ ...form, program: e.target.value })}
            />
          </div>
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>Début</label>
              <input
                type="date"
                className="edu-input"
                value={form.periodStart}
                onChange={e => setForm({ ...form, periodStart: e.target.value })}
              />
            </div>
            <div className="edu-form-group">
              <label>Fin</label>
              <input
                type="date"
                className="edu-input"
                value={form.periodEnd}
                onChange={e => setForm({ ...form, periodEnd: e.target.value })}
              />
            </div>
          </div>
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>Heures / semaine</label>
              <input
                type="number"
                className="edu-input"
                value={form.weeklyHours ?? ''}
                onChange={e =>
                  setForm({
                    ...form,
                    weeklyHours: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
            <div className="edu-form-group">
              <label>Statut</label>
              <select
                className="edu-select"
                value={form.status}
                onChange={e =>
                  setForm({ ...form, status: e.target.value as EducationClass['status'] })
                }
              >
                {Object.entries(CLASS_STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="edu-form-group">
            <label>Couleur</label>
            <div className="edu-row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {CLASS_COLOR_PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    background: c,
                    border: c === form.color ? '2px solid white' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                  aria-label={`Couleur ${c}`}
                />
              ))}
            </div>
          </div>
          <div className="edu-form-group">
            <label>Notes internes</label>
            <textarea
              className="edu-textarea"
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Notes libres sur la classe…"
            />
          </div>
          {error && <div style={{ color: '#EF4444', fontSize: 13, marginTop: 6 }}>{error}</div>}
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="edu-btn" disabled={!form.name.trim() || saving} onClick={save}>
            {saving ? 'Enregistrement…' : initial ? 'Enregistrer' : 'Créer la classe'}
          </button>
        </div>
      </div>
    </>
  )
}
