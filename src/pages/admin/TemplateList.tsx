import PageHeader from '../../components/admin/ui/PageHeader'
import React, { useEffect, useState } from 'react'
import { fetchTemplates, createTemplate, deleteTemplate } from '../../services/templates'
import type { ProjectTemplate } from '../../types/template.types'
import { useToast } from '../../context/ToastContext'
import { useI18n } from '../../context/I18nContext'
import ConfirmModal from '../../components/ConfirmModal'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import './Production.css'

export default function TemplateList() {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { showToast } = useToast()
  const { t } = useI18n()

  const load = async () => {
    try {
      const data = await fetchTemplates()
      setTemplates(data)
    } catch {
      showToast(t('adminAccess.templates.loadFailed'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await createTemplate({ name, description })
      setName('')
      setDescription('')
      setShowForm(false)
      showToast(t('adminAccess.templates.created'), 'success')
      await load()
    } catch {
      showToast(t('adminAccess.templates.createFailed'), 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteTemplate(deleteId)
      setDeleteId(null)
      showToast(t('adminAccess.templates.deleted'), 'success')
      await load()
    } catch {
      showToast(t('adminAccess.templates.deleteFailed'), 'error')
    }
  }

  return (
    <div className="portal-container production-page production-list production-templates">
      <div className="portal-card production-intro">
        <div className="production-header">
          <PageHeader
            eyebrow={t('shell.navItem.projects')}
            title={t('adminAccess.templates.title')}
            actions={
              <button className="portal-button" onClick={() => setShowForm(!showForm)}>
                {showForm ? t('common.cancel') : t('adminAccess.templates.newTemplate')}
              </button>
            }
          />
        </div>
      </div>

      {showForm && (
        <div className="admin-form-section" style={{ marginTop: 24 }}>
          <form onSubmit={handleCreate} className="portal-list">
            <input
              className="portal-input"
              placeholder={t('adminAccess.templates.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <textarea
              className="portal-input"
              placeholder={t('adminAccess.templates.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
            <button className="portal-button" type="submit">
              {t('adminAccess.templates.create')}
            </button>
          </form>
        </div>
      )}

      <div className="admin-form-section" style={{ marginTop: 24 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>{t('common.loading')}</div>
        ) : templates.length === 0 ? (
          <div className="admin-empty-state" style={{ padding: 48 }}>
            <p className="admin-empty-state-text">{t('adminAccess.templates.empty')}</p>
          </div>
        ) : (
          <div className="admin-list">
            {templates.map((tpl) => (
              <div key={tpl._id} className="admin-list-item">
                <div className="admin-list-item-content">
                  <h4 className="admin-list-item-title">{tpl.name}</h4>
                  <p className="admin-list-item-subtitle">
                    {tpl.serviceTypes.length > 0 && (
                      <span>{t('adminAccess.templates.serviceCount', { count: tpl.serviceTypes.length })}</span>
                    )}
                    {tpl.defaultTasks.length > 0 && (
                      <span style={{ marginLeft: 8 }}>
                        {t('adminAccess.templates.taskCount', { count: tpl.defaultTasks.length })}
                      </span>
                    )}
                    {tpl.defaultSections.length > 0 && (
                      <span style={{ marginLeft: 8 }}>
                        {t('adminAccess.templates.sectionCount', { count: tpl.defaultSections.length })}
                      </span>
                    )}
                    {!tpl.serviceTypes.length && !tpl.defaultTasks.length && !tpl.defaultSections.length && (
                      <span>{t('adminAccess.templates.emptyTemplate')}</span>
                    )}
                  </p>
                </div>
                <div className="admin-list-item-actions">
                  <button
                    className="portal-button secondary"
                    onClick={() => setDeleteId(tpl._id)}
                    style={{
                      fontSize: 12,
                      padding: '8px 12px',
                      background: 'color-mix(in srgb, var(--critical) 10%, transparent)',
                      borderColor: 'color-mix(in srgb, var(--critical) 30%, transparent)',
                    }}
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteId && (
        <ConfirmModal
          isOpen={true}
          title={t('adminAccess.templates.confirmTitle')}
          message={t('adminAccess.templates.confirmMessage')}
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
