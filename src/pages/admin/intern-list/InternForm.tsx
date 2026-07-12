import type { Dispatch, SetStateAction } from 'react'
import { INTERN_DAYS, type AdminUser, type Intern, type InternFormData } from './types'

interface Props {
  admins: AdminUser[]
  editingIntern: Intern | null
  form: InternFormData
  setForm: Dispatch<SetStateAction<InternFormData>>
  submitting: boolean
  onCreate: () => void
  onUpdate: () => void
  onCancel: () => void
}

export default function InternForm({
  admins,
  editingIntern,
  form,
  setForm,
  submitting,
  onCreate,
  onUpdate,
  onCancel,
}: Props) {
  const update = <K extends keyof InternFormData>(key: K, value: InternFormData[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const togglePresenceDay = (day: string) => {
    setForm((current) => ({
      ...current,
      joursPresence: current.joursPresence.includes(day)
        ? current.joursPresence.filter((value) => value !== day)
        : [...current.joursPresence, day],
    }))
  }

  return (
    <div className="portal-card" style={{ marginTop: 16, marginBottom: 20 }}>
      <div className="ticket-form">
        <h3 style={{ margin: '0 0 16px', color: 'var(--primary)' }}>
          {editingIntern ? 'Modifier' : 'Nouveau'} {form.type === 'ALTERNANT' ? 'alternant' : 'stagiaire'}
        </h3>
        <div className="ticket-form-row">
          <div className="ticket-form-field">
            <label>Type *</label>
            <select
              value={form.type}
              onChange={(event) => update('type', event.target.value as InternFormData['type'])}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'inherit',
                fontSize: 14,
              }}
            >
              <option value="STAGIAIRE">Stagiaire</option>
              <option value="ALTERNANT">Alternant</option>
            </select>
          </div>
          <div className="ticket-form-field">
            <label>Nom complet *</label>
            <input
              placeholder="Nom complet"
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              disabled={!!editingIntern}
            />
          </div>
          <div className="ticket-form-field">
            <label>Email *</label>
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(event) => update('email', event.target.value)}
              disabled={!!editingIntern}
            />
          </div>
        </div>
        <div className="ticket-form-row">
          <div className="ticket-form-field">
            <label>Telephone</label>
            <input
              placeholder="Telephone"
              value={form.phone}
              onChange={(event) => update('phone', event.target.value)}
              disabled={!!editingIntern}
            />
          </div>
          {!editingIntern ? (
            <div className="ticket-form-field">
              <label>Mot de passe</label>
              <input
                type="password"
                placeholder="Defaut: Stage2026!"
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
              />
            </div>
          ) : (
            <MissionField form={form} update={update} />
          )}
        </div>
        {!editingIntern && (
          <div className="ticket-form-row">
            <MissionField form={form} update={update} />
            <DepartmentField form={form} update={update} />
          </div>
        )}
        {editingIntern && (
          <div className="ticket-form-row">
            <DepartmentField form={form} update={update} />
            <TutorField admins={admins} form={form} update={update} />
          </div>
        )}
        <div className="ticket-form-row">
          <DateField label="Date de debut *" value={form.dateDebut} onChange={(value) => update('dateDebut', value)} />
          <DateField label="Date de fin *" value={form.dateFin} onChange={(value) => update('dateFin', value)} />
        </div>
        {!editingIntern && (
          <div className="ticket-form-row">
            <TutorField admins={admins} form={form} update={update} />
            <SchoolField form={form} update={update} />
          </div>
        )}
        {editingIntern && (
          <div className="ticket-form-row">
            <SchoolField form={form} update={update} />
            <TrainingField form={form} update={update} />
          </div>
        )}
        {!editingIntern && <TrainingField form={form} update={update} />}
        <div className="ticket-form-field">
          <label>Notes internes</label>
          <textarea
            placeholder="Notes internes"
            rows={3}
            value={form.notes}
            onChange={(event) => update('notes', event.target.value)}
          />
        </div>
        <div className="ticket-form-field">
          <label>Jours de présence</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {INTERN_DAYS.map((day) => {
              const checked = form.joursPresence.includes(day)
              return (
                <label
                  key={day}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    cursor: 'pointer',
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: checked ? 'rgba(14, 165, 233, 0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${checked ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`,
                    fontSize: 13,
                    color: checked ? 'var(--primary)' : 'rgba(255,255,255,0.6)',
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    style={{ display: 'none' }}
                    onChange={() => togglePresenceDay(day)}
                  />
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                </label>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button className="ticket-new-btn" disabled={submitting} onClick={editingIntern ? onUpdate : onCreate}>
            {submitting ? 'En cours...' : editingIntern ? 'Enregistrer' : 'Creer le stagiaire'}
          </button>
          <button className="ticket-back-btn" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}

type UpdateForm = <K extends keyof InternFormData>(key: K, value: InternFormData[K]) => void
interface FieldProps {
  form: InternFormData
  update: UpdateForm
}

function MissionField({ form, update }: FieldProps) {
  return (
    <div className="ticket-form-field">
      <label>Poste / Mission *</label>
      <input
        placeholder="Poste / Mission"
        value={form.poste}
        onChange={(event) => update('poste', event.target.value)}
      />
    </div>
  )
}

function DepartmentField({ form, update }: FieldProps) {
  return (
    <div className="ticket-form-field">
      <label>Departement</label>
      <input
        placeholder="Departement"
        value={form.departement}
        onChange={(event) => update('departement', event.target.value)}
      />
    </div>
  )
}

function TutorField({ admins, form, update }: FieldProps & { admins: AdminUser[] }) {
  return (
    <div className="ticket-form-field">
      <label>Tuteur</label>
      <select value={form.tuteur} onChange={(event) => update('tuteur', event.target.value)}>
        <option value="">-- Tuteur --</option>
        {admins.map((admin) => (
          <option key={admin._id} value={admin._id}>
            {admin.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function SchoolField({ form, update }: FieldProps) {
  return (
    <div className="ticket-form-field">
      <label>Ecole / Universite</label>
      <input
        placeholder="Ecole / Universite"
        value={form.ecole}
        onChange={(event) => update('ecole', event.target.value)}
      />
    </div>
  )
}

function TrainingField({ form, update }: FieldProps) {
  return (
    <div className="ticket-form-field">
      <label>Formation</label>
      <input
        placeholder="Formation"
        value={form.formation}
        onChange={(event) => update('formation', event.target.value)}
      />
    </div>
  )
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="ticket-form-field">
      <label>{label}</label>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}
