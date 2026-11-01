import type { Dispatch, SetStateAction } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { INTERN_DAYS, INTERN_DAY_LABEL_KEYS, type AdminUser, type Intern, type InternFormData } from './types'

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
  const { t } = useI18n()
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
          {t(
            editingIntern
              ? form.type === 'ALTERNANT'
                ? 'intern.form.titleEditApprentice'
                : 'intern.form.titleEditIntern'
              : form.type === 'ALTERNANT'
                ? 'intern.form.titleNewApprentice'
                : 'intern.form.titleNewIntern',
          )}
        </h3>
        <div className="ticket-form-row">
          <div className="ticket-form-field">
            <label>{t('intern.form.type')}</label>
            <select
              value={form.type}
              onChange={(event) => update('type', event.target.value as InternFormData['type'])}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--r-md)',
                background: 'color-mix(in srgb, var(--text-primary) 6%, transparent)',
                border: '1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)',
                color: 'inherit',
                fontSize: 14,
              }}
            >
              <option value="STAGIAIRE">{t('intern.type.intern')}</option>
              <option value="ALTERNANT">{t('intern.type.apprentice')}</option>
            </select>
          </div>
          <div className="ticket-form-field">
            <label>{t('intern.form.fullName')}</label>
            <input
              placeholder={t('intern.form.fullNamePlaceholder')}
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              disabled={!!editingIntern}
            />
          </div>
          <div className="ticket-form-field">
            <label>{t('intern.form.email')}</label>
            <input
              type="email"
              placeholder={t('intern.form.emailPlaceholder')}
              value={form.email}
              onChange={(event) => update('email', event.target.value)}
              disabled={!!editingIntern}
            />
          </div>
        </div>
        <div className="ticket-form-row">
          <div className="ticket-form-field">
            <label>{t('intern.form.phone')}</label>
            <input
              placeholder={t('intern.form.phone')}
              value={form.phone}
              onChange={(event) => update('phone', event.target.value)}
              disabled={!!editingIntern}
            />
          </div>
          {!editingIntern ? (
            <div className="ticket-form-field">
              <label>{t('intern.form.password')}</label>
              <input
                type="password"
                placeholder={t('intern.form.passwordPlaceholder')}
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
          <DateField
            label={t('intern.form.startDate')}
            value={form.dateDebut}
            onChange={(value) => update('dateDebut', value)}
          />
          <DateField
            label={t('intern.form.endDate')}
            value={form.dateFin}
            onChange={(value) => update('dateFin', value)}
          />
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
          <label>{t('intern.form.internalNotes')}</label>
          <textarea
            placeholder={t('intern.form.internalNotes')}
            rows={3}
            value={form.notes}
            onChange={(event) => update('notes', event.target.value)}
          />
        </div>
        <div className="ticket-form-field">
          <label>{t('intern.form.presenceDays')}</label>
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
                    borderRadius: 'var(--r-sm)',
                    background: checked
                      ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                      : 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                    border: `1px solid ${checked ? 'var(--primary)' : 'color-mix(in srgb, var(--text-primary) 10%, transparent)'}`,
                    fontSize: 13,
                    color: checked ? 'var(--primary)' : 'var(--text-secondary)',
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    style={{ display: 'none' }}
                    onChange={() => togglePresenceDay(day)}
                  />
                  {t(INTERN_DAY_LABEL_KEYS[day])}
                </label>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button className="ticket-new-btn" disabled={submitting} onClick={editingIntern ? onUpdate : onCreate}>
            {submitting ? t('intern.form.submitting') : editingIntern ? t('intern.form.save') : t('intern.form.create')}
          </button>
          <button className="ticket-back-btn" onClick={onCancel}>
            {t('intern.form.cancel')}
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
  const { t } = useI18n()
  return (
    <div className="ticket-form-field">
      <label>{t('intern.form.mission')}</label>
      <input
        placeholder={t('intern.form.missionPlaceholder')}
        value={form.poste}
        onChange={(event) => update('poste', event.target.value)}
      />
    </div>
  )
}

function DepartmentField({ form, update }: FieldProps) {
  const { t } = useI18n()
  return (
    <div className="ticket-form-field">
      <label>{t('intern.form.department')}</label>
      <input
        placeholder={t('intern.form.department')}
        value={form.departement}
        onChange={(event) => update('departement', event.target.value)}
      />
    </div>
  )
}

function TutorField({ admins, form, update }: FieldProps & { admins: AdminUser[] }) {
  const { t } = useI18n()
  return (
    <div className="ticket-form-field">
      <label>{t('intern.form.tutor')}</label>
      <select value={form.tuteur} onChange={(event) => update('tuteur', event.target.value)}>
        <option value="">{t('intern.form.tutorOption')}</option>
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
  const { t } = useI18n()
  return (
    <div className="ticket-form-field">
      <label>{t('intern.form.school')}</label>
      <input
        placeholder={t('intern.form.school')}
        value={form.ecole}
        onChange={(event) => update('ecole', event.target.value)}
      />
    </div>
  )
}

function TrainingField({ form, update }: FieldProps) {
  const { t } = useI18n()
  return (
    <div className="ticket-form-field">
      <label>{t('intern.form.training')}</label>
      <input
        placeholder={t('intern.form.training')}
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
