import type { FormEvent } from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { Project, Member } from './types'

interface MissionFormState {
  projectId: string
  title: string
  description: string
  assignedTo: string[]
  dueDate: string
}

interface Props {
  form: MissionFormState
  setForm: (updater: (f: MissionFormState) => MissionFormState) => void
  projects: Project[]
  admins: Member[]
  saving: boolean
  onClose: () => void
  onSubmit: (e: FormEvent) => void
}

export default function MissionFormDrawer({ form, setForm, projects, admins, saving, onClose, onSubmit }: Props) {
  const { t } = useI18n()
  return (
    <div className="portal-card" style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
        {t('projA.missionForm.title')}
      </h2>
      <form onSubmit={onSubmit}>
        <div className="production-form-grid">
          <div>
            <label className="portal-label">{t('projA.missionForm.projectLabel')}</label>
            <select
              className="portal-input"
              value={form.projectId}
              onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
              required
            >
              <option value="">{t('projA.missionForm.choose')}</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.entity} · {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="portal-label">{t('projA.common.deadline')}</label>
            <input
              type="date"
              className="portal-input"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">{t('projA.missionForm.titleLabel')}</label>
            <input
              className="portal-input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t('projA.missionForm.titlePlaceholder')}
              required
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">{t('projA.common.description')}</label>
            <textarea
              className="portal-input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder={t('projA.missionForm.descriptionPlaceholder')}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">{t('projA.missionForm.assignTo')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {admins.map((a) => {
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
                    }}
                  >
                    {a.name}
                    {selected && <span style={{ fontSize: 10 }}>✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="portal-button" type="submit" disabled={saving}>
            {saving ? t('projA.missionForm.creating') : t('projA.missionForm.create')}
          </button>
          <button className="portal-button secondary" type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}
