import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchTemplates, createTemplate, deleteTemplate } from '../../services/templates'
import type { ProjectTemplate } from '../../types/template.types'
import { useToast } from '../../context/ToastContext'
import ConfirmModal from '../../components/ConfirmModal'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

export default function TemplateList() {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { showToast } = useToast()

  const load = async () => {
    try {
      const data = await fetchTemplates()
      setTemplates(data)
    } catch {
      showToast('Erreur chargement templates', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await createTemplate({ name, description })
      setName('')
      setDescription('')
      setShowForm(false)
      showToast('Template cree', 'success')
      await load()
    } catch {
      showToast('Erreur creation template', 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteTemplate(deleteId)
      setDeleteId(null)
      showToast('Template supprime', 'success')
      await load()
    } catch {
      showToast('Erreur suppression', 'error')
    }
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>Templates projet</span>
        </div>
        <div className="admin-header">
          <h1>Templates de projet</h1>
          <button className="portal-button" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Annuler' : '+ Nouveau template'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="admin-form-section" style={{ marginTop: 24 }}>
          <form onSubmit={handleCreate} className="portal-list">
            <input
              className="portal-input"
              placeholder="Nom du template"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <textarea
              className="portal-input"
              placeholder="Description (optionnel)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
            <button className="portal-button" type="submit">Creer</button>
          </form>
        </div>
      )}

      <div className="admin-form-section" style={{ marginTop: 24 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Chargement...</div>
        ) : templates.length === 0 ? (
          <div className="admin-empty-state" style={{ padding: 48 }}>
            <p className="admin-empty-state-text">Aucun template. Creez-en un pour accelerer la creation de projets.</p>
          </div>
        ) : (
          <div className="admin-list">
            {templates.map((t) => (
              <div key={t._id} className="admin-list-item">
                <div className="admin-list-item-content">
                  <h4 className="admin-list-item-title">{t.name}</h4>
                  <p className="admin-list-item-subtitle">
                    {t.serviceTypes.length > 0 && <span>{t.serviceTypes.length} services</span>}
                    {t.defaultTasks.length > 0 && <span style={{ marginLeft: 8 }}>{t.defaultTasks.length} taches</span>}
                    {t.defaultSections.length > 0 && <span style={{ marginLeft: 8 }}>{t.defaultSections.length} sections</span>}
                    {!t.serviceTypes.length && !t.defaultTasks.length && !t.defaultSections.length && <span>Template vide</span>}
                  </p>
                </div>
                <div className="admin-list-item-actions">
                  <button
                    className="portal-button secondary"
                    onClick={() => setDeleteId(t._id)}
                    style={{ fontSize: 12, padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                  >
                    Supprimer
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
          title="Supprimer ce template ?"
          message="Cette action est irreversible."
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
