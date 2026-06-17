import { useRef, useState } from 'react'
import {
  Paperclip,
  Download,
  Trash2,
  FileText,
  FileSpreadsheet,
  FileImage,
  File as FileIcon,
  Loader2,
} from 'lucide-react'
import { apiUpload, apiDownload, apiFetch, ApiError } from '../../../lib/api'
import { useToast } from '../../../context/ToastContext'
import type { SubsidiaryDocument, SubsidiaryDocumentCategory } from '../../../types/subsidiary.types'

function formatBytes(n: number): string {
  if (!n) return '0 o'
  const units = ['o', 'Ko', 'Mo', 'Go']
  const i = Math.floor(Math.log(n) / Math.log(1024))
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function DocIcon({ name, mime, size = 18 }: { name: string; mime: string; size?: number }) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (mime.includes('image') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
    return <FileImage size={size} />
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet size={size} />
  if (['doc', 'docx', 'pdf', 'txt', 'md', 'ppt', 'pptx'].includes(ext)) return <FileText size={size} />
  return <FileIcon size={size} />
}

interface Props {
  subsidiaryId: string
  category: SubsidiaryDocumentCategory
  documents: SubsidiaryDocument[]
  accent: string
  onChange: (docs: SubsidiaryDocument[]) => void
}

export default function SubsidiaryDocuments({ subsidiaryId, category, documents, accent, onChange }: Props) {
  const { showToast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const docs = documents.filter((d) => d.category === category)

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('category', category)
      const res = await apiUpload<{ documents: SubsidiaryDocument[] }>(
        `/api/admin/subsidiaries/${subsidiaryId}/documents`,
        fd,
      )
      onChange(res.documents)
      showToast('Document ajouté', 'success')
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec de l’envoi', 'error')
    } finally {
      setUploading(false)
    }
  }

  async function handleDownload(doc: SubsidiaryDocument) {
    setBusyId(doc._id)
    try {
      const { blob, filename } = await apiDownload(`/api/admin/subsidiaries/${subsidiaryId}/documents/${doc._id}`)
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = filename || doc.originalName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
    } catch {
      showToast('Téléchargement impossible', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(doc: SubsidiaryDocument) {
    if (!confirm(`Supprimer « ${doc.originalName} » ?`)) return
    setBusyId(doc._id)
    try {
      const res = await apiFetch<{ documents: SubsidiaryDocument[] }>(
        `/api/admin/subsidiaries/${subsidiaryId}/documents/${doc._id}`,
        { method: 'DELETE' },
      )
      onChange(res.documents)
    } catch {
      showToast('Suppression impossible', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="sub-docs">
      {docs.map((doc) => (
        <div key={doc._id} className="sub-doc" style={{ ['--sub-accent' as string]: accent }}>
          <button type="button" className="sub-doc__main" onClick={() => handleDownload(doc)} title="Télécharger">
            <span className="sub-doc__icon" style={{ color: accent }}>
              {busyId === doc._id ? (
                <Loader2 size={18} className="sub-spin" />
              ) : (
                <DocIcon name={doc.originalName} mime={doc.mimeType} />
              )}
            </span>
            <span className="sub-doc__meta">
              <span className="sub-doc__name">{doc.originalName}</span>
              <span className="sub-doc__size">{formatBytes(doc.size)}</span>
            </span>
            <Download size={15} className="sub-doc__dl" />
          </button>
          <button
            type="button"
            className="sub-doc__del"
            onClick={() => handleDelete(doc)}
            title="Supprimer"
            aria-label="Supprimer le document"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleUpload(f)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        className="sub-doc-add"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{ ['--sub-accent' as string]: accent }}
      >
        {uploading ? <Loader2 size={14} className="sub-spin" /> : <Paperclip size={14} />} Joindre un document
      </button>
    </div>
  )
}
