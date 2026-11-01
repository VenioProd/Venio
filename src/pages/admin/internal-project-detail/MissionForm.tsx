import type { FormEvent } from 'react'
import { useI18n } from '../../../context/I18nContext'
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
  const { t } = useI18n()
  return (
    <form
      onSubmit={onSubmit}
      style={{
        marginBottom: 16,
        padding: '16px',
        borderRadius: 'var(--r-md)',
        background: 'color-mix(in srgb, var(--primary) 4%, transparent)',
        border: '1px solid color-mix(in srgb, var(--primary) 15%, transparent)',
      }}
    >
      <div className="production-form-grid">
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="portal-label">{t('projB.form.titleLabel')}</label>
          <input
            className="portal-input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={t('projB.form.titlePlaceholder')}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="portal-label">{t('projB.form.descriptionLabel')}</label>
          <textarea
            className="portal-input"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            style={{ resize: 'vertical' }}
            placeholder={t('projB.form.descriptionPlaceholder')}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="portal-label">
            {t('projB.form.assignLabel')}{' '}
            <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 11 }}>
              {t('projB.form.multipleHint')}
            </span>
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
                    borderRadius: 'var(--r-pill)',
                    border: `1px solid ${selected ? 'color-mix(in srgb, var(--good) 50%, transparent)' : 'color-mix(in srgb, var(--text-primary) 10%, transparent)'}`,
                    background: selected ? 'color-mix(in srgb, var(--good) 12%, transparent)' : 'transparent',
                    color: selected ? 'var(--good)' : 'var(--text-secondary)',
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
                      background: selected
                        ? 'color-mix(in srgb, var(--good) 20%, transparent)'
                        : 'color-mix(in srgb, var(--text-secondary) 10%, transparent)',
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
            <div style={{ fontSize: 11, color: 'var(--good)', marginTop: 4 }}>
              {t('projB.form.selectedCount', { count: form.assignedTo.length })}
            </div>
          )}
        </div>
        <div>
          <label className="portal-label">{t('projB.form.deadline')}</label>
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
          {saving ? t('projB.form.creating') : t('projB.form.create')}
        </button>
        <button className="portal-button secondary" type="button" onClick={onCancel} style={{ fontSize: 13 }}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}
