import type { FormEvent } from 'react'
import { useI18n } from '../../../context/I18nContext'

interface ProjectFormState {
  key: string
  name: string
  description: string
  color: string
}

interface Props {
  form: ProjectFormState
  setForm: (updater: (f: ProjectFormState) => ProjectFormState) => void
  error: string | null
  saving: boolean
  onSubmit: (e: FormEvent) => void
  onClose: () => void
}

export default function ProjectCreateModal({ form, setForm, error, saving, onSubmit, onClose }: Props) {
  const { t } = useI18n()
  return (
    <div className="dev-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <form className="dev-modal" onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <h2>{t('devA.projectModal.title')}</h2>
        <div className="dev-modal-field">
          <label>{t('devA.projectModal.keyLabel')}</label>
          <input
            value={form.key}
            onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toUpperCase() }))}
            placeholder="ARROW, VEN…"
            maxLength={8}
            required
          />
        </div>
        <div className="dev-modal-field">
          <label>{t('devA.projectModal.nameLabel')}</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Arrow SaaS, Site Venio…"
            required
          />
        </div>
        <div className="dev-modal-field">
          <label>{t('devA.projectModal.descriptionLabel')}</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
          />
        </div>
        <div className="dev-modal-field">
          <label>{t('devA.projectModal.colorLabel')}</label>
          <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
        </div>
        {error && <div style={{ color: 'var(--critical)', fontSize: 12.5, marginTop: 6 }}>{error}</div>}
        <div className="dev-modal-actions">
          <button type="button" className="dev-btn subtle" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="dev-btn primary" disabled={saving}>
            {saving ? t('devA.projectModal.creating') : t('devA.projectModal.create')}
          </button>
        </div>
      </form>
    </div>
  )
}
