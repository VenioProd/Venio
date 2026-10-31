import React from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { ArrowSchool, ArrowSchoolFormData } from '../../../types/arrow.types'
import { labelOfValue } from '../crm-board/constants'
import {
  ARROW_STATUSES,
  ARROW_SCHOOL_TYPES,
  ARROW_TEMPERATURES,
  ARROW_SOURCES,
  ARROW_SOURCE_LABEL_KEYS,
} from './constants'

interface AdminUser {
  _id: string
  name: string
  email: string
}

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
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: 10,
        marginTop: 4,
      }}
    >
      {children}
    </div>
  )
}

export default function SchoolFormPanel({ form, setForm, onSubmit, onCancel, loading, editing, admins }: Props) {
  const { t } = useI18n()
  const f =
    (field: keyof ArrowSchoolFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))

  return (
    <>
      {/* Overlay */}
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1100 }} />

      {/* Panneau latéral */}
      <div
        style={{
          position: 'fixed',
          top: 65,
          right: 0,
          bottom: 0,
          width: 'min(500px, 100vw)',
          background: '#13151f',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          zIndex: 1101,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-12px 0 48px rgba(0,0,0,0.8)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            {editing ? t('crm.arrow.form.editTitle') : t('crm.arrow.form.addTitle')}
          </h2>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 22,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Corps scrollable */}
        <form
          onSubmit={onSubmit}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* École */}
          <div>
            <SectionTitle>{t('crm.arrow.form.sectionSchool')}</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                className="portal-input"
                placeholder={t('crm.arrow.form.name')}
                value={form.name}
                onChange={f('name')}
                required
              />
              <select className="portal-input" value={form.schoolType} onChange={f('schoolType')}>
                {ARROW_SCHOOL_TYPES.map((tp) => (
                  <option key={tp.key} value={tp.key}>
                    {t(tp.labelKey)}
                  </option>
                ))}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input
                  className="portal-input"
                  placeholder={t('crm.arrow.form.city')}
                  value={form.city}
                  onChange={f('city')}
                />
                <input
                  className="portal-input"
                  placeholder={t('crm.arrow.form.region')}
                  value={form.region}
                  onChange={f('region')}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input
                  className="portal-input"
                  type="number"
                  placeholder={t('crm.arrow.form.students')}
                  value={form.studentCount}
                  onChange={f('studentCount')}
                />
                <input
                  className="portal-input"
                  type="email"
                  placeholder={t('crm.arrow.form.generalEmail')}
                  value={form.emailGeneral}
                  onChange={f('emailGeneral')}
                />
              </div>
            </div>
          </div>

          {/* Contact référent */}
          <div>
            <SectionTitle>{t('crm.arrow.form.sectionContact')}</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input
                  className="portal-input"
                  placeholder={t('crm.arrow.form.contactName')}
                  value={form.contactName}
                  onChange={f('contactName')}
                />
                <input
                  className="portal-input"
                  placeholder={t('crm.arrow.form.contactRole')}
                  value={form.contactRole}
                  onChange={f('contactRole')}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input
                  className="portal-input"
                  type="email"
                  placeholder={t('crm.arrow.form.contactEmail')}
                  value={form.contactEmail}
                  onChange={f('contactEmail')}
                />
                <input
                  className="portal-input"
                  placeholder={t('crm.col.phone')}
                  value={form.contactPhone}
                  onChange={f('contactPhone')}
                />
              </div>
            </div>
          </div>

          {/* Prospection */}
          <div>
            <SectionTitle>{t('crm.arrow.form.sectionProspecting')}</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <select className="portal-input" value={form.status} onChange={f('status')}>
                  {ARROW_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {t(s.labelKey)}
                    </option>
                  ))}
                </select>
                <select className="portal-input" value={form.temperature} onChange={f('temperature')}>
                  {ARROW_TEMPERATURES.map((tp) => (
                    <option key={tp.key} value={tp.key}>
                      {t(tp.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <select className="portal-input" value={form.source} onChange={f('source')}>
                  <option value="">{t('crm.col.source')}</option>
                  {ARROW_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {labelOfValue(t, ARROW_SOURCE_LABEL_KEYS, s)}
                    </option>
                  ))}
                </select>
                <select className="portal-input" value={form.assignedTo} onChange={f('assignedTo')}>
                  <option value="">{t('crm.arrow.form.assigned')}</option>
                  {admins.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                    {t('crm.arrow.form.nextContact')}
                  </div>
                  <input className="portal-input" type="date" value={form.nextActionAt} onChange={f('nextActionAt')} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                    {t('crm.arrow.form.lastContact')}
                  </div>
                  <input
                    className="portal-input"
                    type="date"
                    value={form.lastContactAt}
                    onChange={f('lastContactAt')}
                  />
                </div>
              </div>
              <textarea
                className="portal-input"
                placeholder={t('crm.arrow.form.notes')}
                value={form.notes}
                onChange={f('notes')}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            gap: 10,
            flexShrink: 0,
            background: '#13151f',
          }}
        >
          <button
            className="portal-button"
            type="submit"
            form="school-form"
            disabled={loading}
            style={{ flex: 1 }}
            onClick={onSubmit as any}
          >
            {loading ? t('crm.common.saving') : editing ? t('common.edit') : t('common.add')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="portal-button secondary"
            style={{ flex: '0 0 auto', padding: '0 20px' }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </>
  )
}
