import React from 'react'
import CustomSelect from '@/components/admin/CustomSelect'
import FileDropZone from '@/components/admin/FileDropZone'
import type { ProjectContentTabProps } from './types'

function isImageMime(mime?: string): boolean {
  return !!mime && mime.startsWith('image/')
}

function getPreviewUrl(projectId: string, itemId: string): string {
  return `/api/admin/projects/${projectId}/items/${itemId}/preview`
}

const getItemTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    LIVRABLE: 'Livrable',
    DEVIS: 'Devis',
    FACTURE: 'Facture',
    CONTRAT: 'Contrat',
    CAHIER_DES_CHARGES: 'Cahier des charges',
    MAQUETTE: 'Maquette',
    DOCUMENTATION: 'Documentation',
    LIEN: 'Lien',
    NOTE: 'Note',
    AUTRE: 'Autre',
  }
  return labels[type] || type
}

const ProjectContentTab: React.FC<ProjectContentTabProps> = ({
  projectId,
  sections,
  items,
  sectionForm,
  setSectionForm,
  itemForm,
  setItemForm,
  selectedFile,
  setSelectedFile,
  canEditContent,
  canViewContent,
  onAddSection,
  onDeleteSection,
  onToggleSectionVisibility,
  onAddItem,
  onDeleteItem,
  onToggleItemVisibility,
  onDownloadItem,
}) => {
  const getItemsBySection = (sectionId: string) => {
    return items.filter((item) => (typeof item.section === 'object' ? item.section?._id : item.section) === sectionId)
  }

  const getItemsWithoutSection = () => {
    return items.filter((item) => !item.section)
  }

  return (
        <div style={{ marginTop: 24 }}>
          {/* Ajouter une section */}
          <div className="admin-form-section">
            <h2>Ajouter une section</h2>
            {canEditContent ? (
              <form className="portal-list" onSubmit={onAddSection}>
                <input
                  className="portal-input"
                  placeholder="Titre de la section"
                  value={sectionForm.title}
                  onChange={(e) => setSectionForm({ ...sectionForm, title: e.target.value })}
                  required
                />
                <textarea
                  className="portal-input"
                  placeholder="Description (optionnel)"
                  value={sectionForm.description}
                  onChange={(e) => setSectionForm({ ...sectionForm, description: e.target.value })}
                  rows={2}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={sectionForm.isVisible}
                    onChange={(e) => setSectionForm({ ...sectionForm, isVisible: e.target.checked })}
                  />
                  <span style={{ fontSize: '14px' }}>Visible pour le client</span>
                </label>
                <button className="portal-button" type="submit">
                  + Créer la section
                </button>
              </form>
            ) : (
              <div className="admin-info">Accès lecture seule au contenu.</div>
            )}
          </div>

          {/* Ajouter un élément */}
          <div className="admin-form-section" style={{ marginTop: 24 }}>
            <h2>Ajouter un élément</h2>
            {canEditContent ? (
              <form className="portal-list" onSubmit={onAddItem}>
              <CustomSelect
                className="portal-input"
                value={itemForm.section as string}
                onChange={(v) => setItemForm({ ...itemForm, section: v })}
                options={[{ value: '', label: 'Sans section' }, ...sections.map((s) => ({ value: s._id, label: s.title }))]}
              />
              <CustomSelect
                className="portal-input"
                value={itemForm.type as string}
                onChange={(v) => setItemForm({ ...itemForm, type: v })}
                options={[
                  { value: 'LIVRABLE', label: 'Livrable' },
                  { value: 'DEVIS', label: 'Devis' },
                  { value: 'FACTURE', label: 'Facture' },
                  { value: 'CONTRAT', label: 'Contrat' },
                  { value: 'CAHIER_DES_CHARGES', label: 'Cahier des charges' },
                  { value: 'MAQUETTE', label: 'Maquette' },
                  { value: 'DOCUMENTATION', label: 'Documentation' },
                  { value: 'LIEN', label: 'Lien' },
                  { value: 'NOTE', label: 'Note' },
                  { value: 'AUTRE', label: 'Autre' },
                ]}
              />
              <input
                className="portal-input"
                placeholder="Titre"
                value={itemForm.title as string}
                onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                required
              />
              <textarea
                className="portal-input"
                placeholder="Description"
                value={itemForm.description as string}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                rows={3}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
              {itemForm.type === 'LIEN' && (
                <input
                  className="portal-input"
                  placeholder="URL (https://...)"
                  value={itemForm.url as string}
                  onChange={(e) => setItemForm({ ...itemForm, url: e.target.value })}
                />
              )}
              {itemForm.type === 'NOTE' && (
                <textarea
                  className="portal-input"
                  placeholder="Contenu de la note"
                  value={itemForm.content as string}
                  onChange={(e) => setItemForm({ ...itemForm, content: e.target.value })}
                  rows={4}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              )}
              {itemForm.type === 'LIVRABLE' && (
                <CustomSelect
                  className="portal-input"
                  value={itemForm.status as string}
                  onChange={(v) => setItemForm({ ...itemForm, status: v })}
                  options={[
                    { value: 'EN_ATTENTE', label: 'En attente' },
                    { value: 'EN_COURS', label: 'En cours' },
                    { value: 'TERMINE', label: 'Terminé' },
                    { value: 'VALIDE', label: 'Validé' },
                  ]}
                />
              )}
              <FileDropZone
                onFile={(file) => setSelectedFile(file)}
                currentFile={selectedFile}
              />
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={itemForm.isVisible as boolean}
                    onChange={(e) => setItemForm({ ...itemForm, isVisible: e.target.checked })}
                  />
                  <span style={{ fontSize: '14px' }}>Visible</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={itemForm.isDownloadable as boolean}
                    onChange={(e) => setItemForm({ ...itemForm, isDownloadable: e.target.checked })}
                  />
                  <span style={{ fontSize: '14px' }}>Téléchargeable</span>
                </label>
              </div>
                <button className="portal-button" type="submit">
                  + Ajouter l'élément
                </button>
              </form>
            ) : (
              <div className="admin-info">Accès lecture seule au contenu.</div>
            )}
          </div>

          {/* Liste des sections et items */}
          <div style={{ marginTop: 24 }}>
            {/* Items sans section */}
            {getItemsWithoutSection().length > 0 && (
              <div className="admin-form-section" style={{ marginBottom: 24 }}>
                <h3>Éléments sans section</h3>
                <div className="admin-list">
                  {getItemsWithoutSection().map((item) => (
                    <div key={item._id} className="admin-list-item">
                      {item.file && isImageMime(item.file.mimeType) && projectId && (
                        <img
                          src={getPreviewUrl(projectId, item._id)}
                          alt={item.title}
                          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                          loading="lazy"
                        />
                      )}
                      <div className="admin-list-item-content">
                        <h4 className="admin-list-item-title">
                          {item.title}
                          {!item.isVisible && <span style={{ marginLeft: '8px', opacity: 0.5 }}>Masque</span>}
                        </h4>
                        <p className="admin-list-item-subtitle">
                          <span className="admin-badge">{getItemTypeLabel(item.type)}</span>
                          {item.file && <span style={{ marginLeft: '8px' }}>{item.file.originalName} ({item.file.size ? `${(item.file.size / 1024).toFixed(0)} Ko` : ''})</span>}
                        </p>
                      </div>
                      <div className="admin-list-item-actions">
                        {canEditContent && (
                          <button
                            className="portal-button secondary"
                            onClick={() => onToggleItemVisibility(item)}
                            style={{ fontSize: '12px', padding: '8px 12px' }}
                          >
                            {item.isVisible ? 'Masquer' : 'Afficher'}
                          </button>
                        )}
                        {canViewContent && item.file && (
                          <button
                            className="portal-button secondary"
                            onClick={() => onDownloadItem(item._id, item.file!.originalName)}
                            style={{ fontSize: '12px', padding: '8px 12px' }}
                          >
                            Telecharger
                          </button>
                        )}
                        {canEditContent && (
                          <button
                            className="portal-button secondary"
                            onClick={() => onDeleteItem(item._id)}
                            style={{ fontSize: '12px', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sections avec leurs items */}
            {sections.map((section) => (
              <div key={section._id} className="admin-form-section" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3>
                    {section.title}
                    {!section.isVisible && <span style={{ marginLeft: '8px', opacity: 0.5 }}>👁️ Masqué</span>}
                  </h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {canEditContent && (
                      <button
                        className="portal-button secondary"
                        onClick={() => onToggleSectionVisibility(section)}
                        style={{ fontSize: '12px', padding: '8px 12px' }}
                      >
                        {section.isVisible ? '👁️ Masquer' : '👁️ Afficher'}
                      </button>
                    )}
                    {canEditContent && (
                      <button
                        className="portal-button secondary"
                        onClick={() => onDeleteSection(section._id)}
                        style={{ fontSize: '12px', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
                {section.description && (
                  <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>{section.description}</p>
                )}
                <div className="admin-list">
                  {getItemsBySection(section._id).length === 0 ? (
                    <div className="admin-empty-state" style={{ padding: '24px' }}>
                      <p className="admin-empty-state-text">Aucun élément dans cette section</p>
                    </div>
                  ) : (
                    getItemsBySection(section._id).map((item) => (
                      <div key={item._id} className="admin-list-item">
                        <div className="admin-list-item-content">
                          <h4 className="admin-list-item-title">
                            {item.title}
                            {!item.isVisible && <span style={{ marginLeft: '8px', opacity: 0.5 }}>👁️ Masqué</span>}
                          </h4>
                          <p className="admin-list-item-subtitle">
                            <span className="admin-badge">{getItemTypeLabel(item.type)}</span>
                            {item.file && <span style={{ marginLeft: '8px' }}>📎 {item.file.originalName}</span>}
                            {!item.isDownloadable && <span style={{ marginLeft: '8px', opacity: 0.5 }}>🔒 Non téléchargeable</span>}
                          </p>
                        </div>
                        <div className="admin-list-item-actions">
                          {canEditContent && (
                            <button
                              className="portal-button secondary"
                              onClick={() => onToggleItemVisibility(item)}
                              style={{ fontSize: '12px', padding: '8px 12px' }}
                            >
                              {item.isVisible ? '👁️ Masquer' : '👁️ Afficher'}
                            </button>
                          )}
                          {canViewContent && item.file && (
                            <button
                              className="portal-button secondary"
                              onClick={() => onDownloadItem(item._id, item.file!.originalName)}
                              style={{ fontSize: '12px', padding: '8px 12px' }}
                            >
                              📥
                            </button>
                          )}
                          {canEditContent && (
                            <button
                              className="portal-button secondary"
                              onClick={() => onDeleteItem(item._id)}
                              style={{ fontSize: '12px', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}

            {sections.length === 0 && getItemsWithoutSection().length === 0 && (
              <div className="admin-empty-state" style={{ padding: '48px' }}>
                <div className="admin-empty-state-icon">📁</div>
                <p className="admin-empty-state-text">Aucun contenu pour ce projet</p>
              </div>
            )}
          </div>
        </div>
  )
}

export default ProjectContentTab
