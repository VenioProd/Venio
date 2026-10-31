import React from 'react'
import type { ProjectItem } from '../types/project.types'
import { useI18n } from '../context/I18nContext'
import type { MessageKey } from '../i18n'

interface ItemCardProps {
  item: ProjectItem
  onDownload: (itemId: string, fileName: string) => void
}

const ITEM_ICONS: Record<string, string> = {
  LIVRABLE: '📦',
  DEVIS: '💰',
  FACTURE: '🧾',
  CONTRAT: '📝',
  CAHIER_DES_CHARGES: '📋',
  MAQUETTE: '🎨',
  DOCUMENTATION: '📚',
  LIEN: '🔗',
  NOTE: '📌',
  AUTRE: '📄',
}

const ITEM_TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  LIVRABLE: 'shared.itemCard.typeDeliverable',
  DEVIS: 'shared.itemCard.typeQuote',
  FACTURE: 'shared.itemCard.typeInvoice',
  CONTRAT: 'shared.itemCard.typeContract',
  CAHIER_DES_CHARGES: 'shared.itemCard.typeSpecs',
  MAQUETTE: 'shared.itemCard.typeMockup',
  DOCUMENTATION: 'shared.itemCard.typeDocumentation',
  LIEN: 'shared.itemCard.typeLink',
  NOTE: 'shared.itemCard.typeNote',
  AUTRE: 'shared.itemCard.typeOther',
}

const getItemIcon = (type: string): string => {
  return ITEM_ICONS[type] || '📄'
}

const getItemTypeLabel = (type: string, t: (key: MessageKey) => string): string => {
  const key = ITEM_TYPE_LABEL_KEYS[type]
  return key ? t(key) : type
}

const normalizeUrl = (url: string | undefined): string => {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  return `https://${url}`
}

const ItemCard: React.FC<ItemCardProps> = ({ item, onDownload }) => {
  const { t } = useI18n()
  return (
    <div className="client-project-item">
      <div className="client-project-item-header">
        <span className="client-project-item-icon">{getItemIcon(item.type)}</span>
        <span className="client-project-item-type">{getItemTypeLabel(item.type, t)}</span>
      </div>
      <h3 className="client-project-item-title">{item.title}</h3>
      {item.description && <p className="client-project-item-description">{item.description}</p>}
      {item.type === 'NOTE' && item.content && <div className="client-project-item-note">{item.content}</div>}
      {item.file && (
        <div className="client-project-item-file">
          <svg
            viewBox="0 0 24 24"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            stroke="currentColor"
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          <span>{item.file.originalName}</span>
        </div>
      )}
      <div className="client-project-item-actions">
        {item.type === 'LIEN' && item.url && (
          <a className="client-project-item-button" href={normalizeUrl(item.url)} target="_blank" rel="noreferrer">
            <svg
              viewBox="0 0 24 24"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              stroke="currentColor"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            {t('shared.itemCard.openLink')}
          </a>
        )}
        {item.file && item.isDownloadable && (
          <button className="client-project-item-button" onClick={() => onDownload(item._id, item.file!.originalName)}>
            <svg
              viewBox="0 0 24 24"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              stroke="currentColor"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t('shared.itemCard.download')}
          </button>
        )}
      </div>
    </div>
  )
}

export default ItemCard
