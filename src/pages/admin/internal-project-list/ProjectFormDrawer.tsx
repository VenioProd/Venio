import type { FormEvent } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { POLE_KEYS, PRIORITY_KEYS, PROJECT_FORM_STATUS_KEYS, labelFor } from './labels'
import type { Member, Project } from './types'
import { emptyForm } from './types'

const ENTITIES = ['Venio', 'Creatio', 'Decisio', 'Formatio', 'Arrow']

interface FormState {
  name: string
  description: string
  entity: string
  poles: string[]
  members: string[]
  status: string
  priority: string
  startDate: string
  endDate: string
  tags: string
}

interface Props {
  form: FormState
  setForm: (updater: (f: FormState) => FormState) => void
  editTarget: Project | null
  saving: boolean
  poles: readonly string[]
  admins: Member[]
  togglePole: (p: string) => void
  toggleMember: (id: string) => void
  onClose: () => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
}

export default function ProjectFormDrawer({
  form,
  setForm,
  editTarget,
  saving,
  poles,
  admins,
  togglePole,
  toggleMember,
  onClose,
  onSubmit,
}: Props) {
  const { t } = useI18n()
  return (
    <div className="portal-card" style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
        {editTarget ? t('projA.projectForm.editTitle') : t('projA.projectForm.newTitle')}
      </h2>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">{t('projA.projectForm.nameLabel')}</label>
            <input
              className="portal-input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('projA.projectForm.namePlaceholder')}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">{t('projA.common.description')}</label>
            <textarea
              className="portal-input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              style={{ resize: 'vertical' }}
              placeholder={t('projA.projectForm.descriptionPlaceholder')}
            />
          </div>
          <div>
            <label className="portal-label">{t('projA.projectForm.entityLabel')}</label>
            <select
              className="portal-input"
              value={form.entity}
              onChange={(e) => setForm((f) => ({ ...f, entity: e.target.value }))}
            >
              {ENTITIES.map((e: string) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="portal-label">{t('projA.projectForm.statusLabel')}</label>
            <select
              className="portal-input"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              {Object.entries(PROJECT_FORM_STATUS_KEYS).map(([v, key]) => (
                <option key={v} value={v}>
                  {t(key)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="portal-label">{t('projA.projectForm.priorityLabel')}</label>
            <select
              className="portal-input"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            >
              <option value="BASSE">{t(PRIORITY_KEYS.BASSE)}</option>
              <option value="NORMALE">{t(PRIORITY_KEYS.NORMALE)}</option>
              <option value="HAUTE">{t(PRIORITY_KEYS.HAUTE)}</option>
              <option value="URGENTE">{t(PRIORITY_KEYS.URGENTE)}</option>
            </select>
          </div>
          <div>
            <label className="portal-label">{t('projA.projectForm.tagsLabel')}</label>
            <input
              className="portal-input"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder={t('projA.projectForm.tagsPlaceholder')}
            />
          </div>
          {/* Poles */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">{t('projA.projectForm.polesLabel')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {poles.map((pole: string) => (
                <button
                  key={pole}
                  type="button"
                  onClick={() => togglePole(pole)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    border: '1px solid',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: form.poles.includes(pole) ? 'rgba(14, 165, 233, 0.2)' : 'transparent',
                    borderColor: form.poles.includes(pole) ? 'var(--primary)' : 'var(--border)',
                    color: form.poles.includes(pole) ? 'var(--primary)' : 'var(--text-secondary)',
                    transition: 'all .15s',
                  }}
                >
                  {labelFor(t, POLE_KEYS, pole)}
                </button>
              ))}
            </div>
          </div>
          {/* Members */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">{t('projA.projectForm.membersLabel')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {admins.map((admin) => (
                <button
                  key={admin._id}
                  type="button"
                  onClick={() => toggleMember(admin._id)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    border: '1px solid',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: form.members.includes(admin._id) ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                    borderColor: form.members.includes(admin._id) ? '#10b981' : 'var(--border)',
                    color: form.members.includes(admin._id) ? '#6ee7b7' : 'var(--text-secondary)',
                    transition: 'all .15s',
                  }}
                >
                  {admin.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button className="portal-button" type="submit" disabled={saving}>
            {saving
              ? t('projA.common.saving')
              : editTarget
                ? t('projA.projectForm.update')
                : t('projA.projectForm.create')}
          </button>
          <button
            className="portal-button secondary"
            type="button"
            onClick={() => {
              onClose()
              setForm(() => ({ ...emptyForm }))
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}
