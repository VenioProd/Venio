import React from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import CustomSelect from '../../../components/admin/CustomSelect'
import FileDropZone from '../../../components/admin/FileDropZone'
import type { ProjectContentTabProps } from './types'

function isImageMime(mime?: string): boolean {
  return !!mime && mime.startsWith('image/')
}

function getPreviewUrl(projectId: string, itemId: string): string {
  return `/api/admin/projects/${projectId}/items/${itemId}/preview`
}

const ITEM_TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  LIVRABLE: 'projects.itemType.deliverable',
  DEVIS: 'projects.itemType.quote',
  FACTURE: 'projects.itemType.invoice',
  CONTRAT: 'projects.itemType.contract',
  CAHIER_DES_CHARGES: 'projects.itemType.specs',
  MAQUETTE: 'projects.itemType.mockup',
  DOCUMENTATION: 'projects.itemType.documentation',
  LIEN: 'projects.itemType.link',
  NOTE: 'projects.itemType.note',
  AUTRE: 'projects.itemType.other',
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
  canUploadDocuments,
  editingItemId,
  canModifyItem,
  onEditItem,
  onCancelEdit,
  canViewContent,
  onAddSection,
  onDeleteSection,
  onToggleSectionVisibility,
  onAddItem,
  onDeleteItem,
  onToggleItemVisibility,
  onDownloadItem,
}) => {
  const { t } = useI18n()
  const getItemTypeLabel = (type: string): string => (ITEM_TYPE_LABEL_KEYS[type] ? t(ITEM_TYPE_LABEL_KEYS[type]) : type)

  const getItemsBySection = (sectionId: string) => {
    return items.filter((item) => (typeof item.section === 'object' ? item.section?._id : item.section) === sectionId)
  }

  const getItemsWithoutSection = () => {
    return items.filter((item) => !item.section)
  }

  return (
    <div style={{ marginTop: 24 }}>
      {/* Ajouter une section */}
      {(canEditContent || !canUploadDocuments) && (
        <div className="admin-form-section">
          <h2>{t('projects.content.addSection')}</h2>
          {canEditContent ? (
            <form className="portal-list" onSubmit={onAddSection}>
              <input
                className="portal-input"
                placeholder={t('projects.content.sectionTitlePlaceholder')}
                value={sectionForm.title}
                onChange={(e) => setSectionForm({ ...sectionForm, title: e.target.value })}
                required
              />
              <textarea
                className="portal-input"
                placeholder={t('projects.content.descriptionOptional')}
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
                <span style={{ fontSize: '14px' }}>{t('projects.content.visibleToClient')}</span>
              </label>
              <button className="portal-button" type="submit">
                {t('projects.content.createSection')}
              </button>
            </form>
          ) : (
            <div className="admin-info">{t('projects.content.readOnly')}</div>
          )}
        </div>
      )}

      {/* Ajouter un élément */}
      <div className="admin-form-section" style={{ marginTop: 24 }}>
        <h2>
          {canEditContent
            ? t('projects.content.addItem')
            : editingItemId
              ? t('projects.content.editDocument')
              : t('projects.content.addDocument')}
        </h2>
        {canEditContent || canUploadDocuments ? (
          <form className="portal-list" onSubmit={onAddItem}>
            <CustomSelect
              className="portal-input"
              value={itemForm.section as string}
              onChange={(v) => setItemForm({ ...itemForm, section: v })}
              options={[
                { value: '', label: t('projects.content.noSection') },
                ...sections.map((s) => ({ value: s._id, label: s.title })),
              ]}
            />
            <CustomSelect
              className="portal-input"
              value={itemForm.type as string}
              onChange={(v) => setItemForm({ ...itemForm, type: v })}
              options={[
                { value: 'LIVRABLE', label: t('projects.itemType.deliverable') },
                { value: 'DEVIS', label: t('projects.itemType.quote') },
                { value: 'FACTURE', label: t('projects.itemType.invoice') },
                { value: 'CONTRAT', label: t('projects.itemType.contract') },
                { value: 'CAHIER_DES_CHARGES', label: t('projects.itemType.specs') },
                { value: 'MAQUETTE', label: t('projects.itemType.mockup') },
                { value: 'DOCUMENTATION', label: t('projects.itemType.documentation') },
                { value: 'LIEN', label: t('projects.itemType.link') },
                { value: 'NOTE', label: t('projects.itemType.note') },
                { value: 'AUTRE', label: t('projects.itemType.other') },
              ].filter((option) => canEditContent || !['LIVRABLE', 'LIEN', 'NOTE'].includes(option.value))}
            />
            <input
              className="portal-input"
              placeholder={t('projects.content.titlePlaceholder')}
              value={itemForm.title as string}
              onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
              required
            />
            <textarea
              className="portal-input"
              placeholder={t('projects.content.descriptionPlaceholder')}
              value={itemForm.description as string}
              onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
              rows={3}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
            {itemForm.type === 'LIEN' && (
              <input
                className="portal-input"
                placeholder={t('projects.content.urlPlaceholder')}
                value={itemForm.url as string}
                onChange={(e) => setItemForm({ ...itemForm, url: e.target.value })}
              />
            )}
            {itemForm.type === 'NOTE' && (
              <textarea
                className="portal-input"
                placeholder={t('projects.content.noteContentPlaceholder')}
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
                  { value: 'EN_ATTENTE', label: t('projects.content.statusPending') },
                  { value: 'EN_COURS', label: t('projects.content.statusInProgress') },
                  { value: 'TERMINE', label: t('projects.content.statusDone') },
                  { value: 'VALIDE', label: t('projects.content.statusValidated') },
                ]}
              />
            )}
            <FileDropZone onFile={(file) => setSelectedFile(file)} currentFile={selectedFile} />
            {canEditContent && (
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={itemForm.isVisible as boolean}
                    onChange={(e) => setItemForm({ ...itemForm, isVisible: e.target.checked })}
                  />
                  <span style={{ fontSize: '14px' }}>{t('projects.content.visible')}</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={itemForm.isDownloadable as boolean}
                    onChange={(e) => setItemForm({ ...itemForm, isDownloadable: e.target.checked })}
                  />
                  <span style={{ fontSize: '14px' }}>{t('projects.content.downloadable')}</span>
                </label>
              </div>
            )}
            <button className="portal-button" type="submit">
              {canEditContent
                ? t('projects.content.submitAddItem')
                : editingItemId
                  ? t('projects.content.submitSaveDocument')
                  : t('projects.content.submitAddDocument')}
            </button>
            {editingItemId && (
              <button className="portal-button secondary" type="button" onClick={onCancelEdit}>
                {t('common.cancel')}
              </button>
            )}
          </form>
        ) : (
          <div className="admin-info">{t('projects.content.readOnly')}</div>
        )}
      </div>

      {/* Liste des sections et items */}
      <div style={{ marginTop: 24 }}>
        {/* Items sans section */}
        {getItemsWithoutSection().length > 0 && (
          <div className="admin-form-section" style={{ marginBottom: 24 }}>
            <h3>{t('projects.content.itemsWithoutSection')}</h3>
            <div className="admin-list">
              {getItemsWithoutSection().map((item) => (
                <div key={item._id} className="admin-list-item">
                  {item.file && isImageMime(item.file.mimeType) && projectId && (
                    <img
                      src={getPreviewUrl(projectId, item._id)}
                      alt={item.title}
                      style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 'var(--r-sm)', flexShrink: 0 }}
                      loading="lazy"
                    />
                  )}
                  <div className="admin-list-item-content">
                    <h4 className="admin-list-item-title">
                      {item.title}
                      {!item.isVisible &&
                        (canEditContent ? (
                          <span style={{ marginLeft: '8px', opacity: 0.5 }}>{t('projects.content.hiddenPlain')}</span>
                        ) : (
                          <span className="admin-badge" style={{ marginLeft: '8px' }}>
                            {t('projects.content.internal')}
                          </span>
                        ))}
                    </h4>
                    <p className="admin-list-item-subtitle">
                      <span className="admin-badge">{getItemTypeLabel(item.type)}</span>
                      {item.file && (
                        <span style={{ marginLeft: '8px' }}>
                          {item.file.originalName} (
                          {item.file.size
                            ? t('projects.content.sizeKb', { size: (item.file.size / 1024).toFixed(0) })
                            : ''}
                          )
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="admin-list-item-actions">
                    {!canEditContent && canModifyItem(item) && (
                      <button
                        className="portal-button secondary"
                        onClick={() => onEditItem(item)}
                        style={{ fontSize: '12px', padding: '8px 12px' }}
                      >
                        {t('projects.content.edit')}
                      </button>
                    )}
                    {canEditContent && (
                      <button
                        className="portal-button secondary"
                        onClick={() => onToggleItemVisibility(item)}
                        style={{ fontSize: '12px', padding: '8px 12px' }}
                      >
                        {item.isVisible ? t('projects.content.hide') : t('projects.content.show')}
                      </button>
                    )}
                    {canViewContent && item.file && (
                      <button
                        className="portal-button secondary"
                        onClick={() => onDownloadItem(item._id, item.file!.originalName)}
                        style={{ fontSize: '12px', padding: '8px 12px' }}
                      >
                        {t('projects.content.download')}
                      </button>
                    )}
                    {canModifyItem(item) && (
                      <button
                        className="portal-button secondary"
                        onClick={() => onDeleteItem(item._id)}
                        style={{
                          fontSize: '12px',
                          padding: '8px 12px',
                          background: 'color-mix(in srgb, var(--critical) 10%, transparent)',
                          borderColor: 'color-mix(in srgb, var(--critical) 30%, transparent)',
                        }}
                      >
                        {t('projects.content.delete')}
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
                {!section.isVisible && (
                  <span style={{ marginLeft: '8px', opacity: 0.5 }}>{t('projects.content.hiddenEmoji')}</span>
                )}
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {canEditContent && (
                  <button
                    className="portal-button secondary"
                    onClick={() => onToggleSectionVisibility(section)}
                    style={{ fontSize: '12px', padding: '8px 12px' }}
                  >
                    {section.isVisible ? t('projects.content.hideEmoji') : t('projects.content.showEmoji')}
                  </button>
                )}
                {canEditContent && (
                  <button
                    className="portal-button secondary"
                    onClick={() => onDeleteSection(section._id)}
                    style={{
                      fontSize: '12px',
                      padding: '8px 12px',
                      background: 'color-mix(in srgb, var(--critical) 10%, transparent)',
                      borderColor: 'color-mix(in srgb, var(--critical) 30%, transparent)',
                    }}
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
                  <p className="admin-empty-state-text">{t('projects.content.emptySection')}</p>
                </div>
              ) : (
                getItemsBySection(section._id).map((item) => (
                  <div key={item._id} className="admin-list-item">
                    <div className="admin-list-item-content">
                      <h4 className="admin-list-item-title">
                        {item.title}
                        {!item.isVisible &&
                          (canEditContent ? (
                            <span style={{ marginLeft: '8px', opacity: 0.5 }}>{t('projects.content.hiddenEmoji')}</span>
                          ) : (
                            <span className="admin-badge" style={{ marginLeft: '8px' }}>
                              {t('projects.content.internal')}
                            </span>
                          ))}
                      </h4>
                      <p className="admin-list-item-subtitle">
                        <span className="admin-badge">{getItemTypeLabel(item.type)}</span>
                        {item.file && <span style={{ marginLeft: '8px' }}>📎 {item.file.originalName}</span>}
                        {!item.isDownloadable && (
                          <span style={{ marginLeft: '8px', opacity: 0.5 }}>
                            {t('projects.content.notDownloadable')}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="admin-list-item-actions">
                      {!canEditContent && canModifyItem(item) && (
                        <button
                          className="portal-button secondary"
                          onClick={() => onEditItem(item)}
                          style={{ fontSize: '12px', padding: '8px 12px' }}
                        >
                          {t('projects.content.edit')}
                        </button>
                      )}
                      {canEditContent && (
                        <button
                          className="portal-button secondary"
                          onClick={() => onToggleItemVisibility(item)}
                          style={{ fontSize: '12px', padding: '8px 12px' }}
                        >
                          {item.isVisible ? t('projects.content.hideEmoji') : t('projects.content.showEmoji')}
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
                      {canModifyItem(item) && (
                        <button
                          className="portal-button secondary"
                          onClick={() => onDeleteItem(item._id)}
                          style={{
                            fontSize: '12px',
                            padding: '8px 12px',
                            background: 'color-mix(in srgb, var(--critical) 10%, transparent)',
                            borderColor: 'color-mix(in srgb, var(--critical) 30%, transparent)',
                          }}
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
            <p className="admin-empty-state-text">{t('projects.content.emptyProject')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ProjectContentTab
