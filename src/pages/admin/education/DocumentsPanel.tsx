/**
 * DocumentsPanel — liste + upload de documents rattachés à une entité pédagogique.
 *
 * Utilisé comme section « Supports » (séance) et « Pièces jointes » (devoir).
 * Upload multipart (bouton ou drag-and-drop), téléchargement authentifié via
 * apiDownload (la route exige le Bearer token), suppression avec confirmation.
 * Limite serveur : 25 Mo par fichier.
 */
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { Download, FileText, Loader2, Plus, Trash2 } from 'lucide-react'
import { apiDownload } from '../../../lib/api'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { formatFileSize, formatShortDate } from './eduFormat'
import {
  deleteDocument,
  documentDownloadUrl,
  listDocuments,
  uploadDocument,
  type EducationDocument,
  type EducationDocumentParentType,
} from '../../../services/education'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 Mo — limite multer côté serveur

export function DocumentsPanel({
  parentType,
  parentId,
}: {
  parentType: EducationDocumentParentType
  parentId: string
}) {
  const { t } = useI18n()
  const [docs, setDocs] = useState<EducationDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await listDocuments({ parentType, parentId })
      setDocs(r.documents)
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('eduA.docs.loadError'))
    } finally {
      setLoading(false)
    }
  }, [parentType, parentId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    setError(null)
    const tooBig = list.find((f) => f.size > MAX_FILE_SIZE)
    if (tooBig) {
      setError(translate('eduA.docsPanel.tooBig', { name: tooBig.name, size: formatFileSize(tooBig.size) }))
      return
    }
    setUploading(true)
    try {
      // Upload séquentiel : simple et suffisant pour quelques fichiers.
      for (const file of list) {
        await uploadDocument(file, { parentType, parentId })
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('eduA.docsPanel.uploadError'))
    } finally {
      setUploading(false)
    }
  }

  async function handleDownload(doc: EducationDocument) {
    // Lien externe (document metadata-only) : ouverture directe.
    if (doc.url && !doc.originalName) {
      window.open(doc.url, '_blank', 'noopener')
      return
    }
    setDownloadingId(doc._id)
    setError(null)
    try {
      const { blob, filename } = await apiDownload(documentDownloadUrl(doc._id))
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = filename || doc.originalName || doc.title || 'document'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('eduA.docsPanel.downloadError'))
    } finally {
      setDownloadingId(null)
    }
  }

  async function handleDelete(doc: EducationDocument) {
    if (!confirm(translate('eduA.docsPanel.deleteConfirm', { name: doc.title || doc.originalName }))) return
    // Optimiste : retrait immédiat, rollback si l'API échoue.
    const prev = docs
    setDocs((d) => d.filter((x) => x._id !== doc._id))
    try {
      await deleteDocument(doc._id)
    } catch (err) {
      setDocs(prev)
      setError(err instanceof Error ? err.message : translate('eduA.common.deleteFailed'))
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
  }

  return (
    <div
      className={`edu-docs ${dragOver ? 'is-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {error && (
        <div className="edu-banner-error" role="alert" style={{ marginBottom: 8 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="edu-docs-empty">{t('eduA.docsPanel.loading')}</div>
      ) : docs.length === 0 ? (
        <div className="edu-docs-empty">{t('eduA.docsPanel.empty')}</div>
      ) : (
        <div className="edu-docs-list">
          {docs.map((doc) => (
            <div key={doc._id} className="edu-docs-item">
              <FileText size={16} className="edu-docs-icon" />
              <div className="edu-docs-info">
                <div className="edu-docs-name" title={doc.originalName || doc.title}>
                  {doc.title || doc.originalName || t('eduA.docsPanel.untitled')}
                </div>
                <div className="edu-docs-meta">
                  {formatFileSize(doc.size)} · {formatShortDate(doc.createdAt)}
                </div>
              </div>
              <button
                className="edu-btn-icon"
                onClick={() => handleDownload(doc)}
                disabled={downloadingId === doc._id}
                title={t('eduA.docsPanel.download')}
                aria-label={t('eduA.docsPanel.downloadLabel', { name: doc.title || doc.originalName })}
              >
                {downloadingId === doc._id ? <Loader2 size={14} className="edu-spin" /> : <Download size={14} />}
              </button>
              <button
                className="edu-btn-icon"
                onClick={() => handleDelete(doc)}
                title={t('common.delete')}
                aria-label={t('eduA.docsPanel.deleteLabel', { name: doc.title || doc.originalName })}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="edu-docs-foot">
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files)
            e.target.value = '' // permet de re-sélectionner le même fichier
          }}
        />
        <button className="edu-btn ghost" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? (
            <>
              <Loader2 size={14} className="edu-spin" /> {t('eduA.docsPanel.uploading')}
            </>
          ) : (
            <>
              <Plus size={14} /> {t('eduA.docsPanel.addFile')}
            </>
          )}
        </button>
        <span className="edu-docs-hint">{t('eduA.docsPanel.dropHint')}</span>
      </div>
    </div>
  )
}

export default DocumentsPanel
