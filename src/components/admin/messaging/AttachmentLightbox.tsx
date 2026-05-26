import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { downloadMessageAttachment } from '@/services/messaging'
import type { InternalMessageAttachment } from '@/types/messaging.types'

interface AttachmentLightboxProps {
  messageId: string | null
  attachments: InternalMessageAttachment[]
  initialIndex: number
  onClose: () => void
}

type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other'

const EXT_MIME: Record<string, string> = {
  // images
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif',
  heic: 'image/heic',
  // documents
  pdf: 'application/pdf',
  // vidéo
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v',
  // audio
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  oga: 'audio/ogg', flac: 'audio/flac',
}

/**
 * Renvoie un mimeType utilisable même quand le serveur a stocké un type
 * générique (octet-stream) ou vide. Fallback sur l'extension du fichier.
 */
function resolveMime(mimeType: string | undefined, name: string): string {
  if (mimeType && mimeType !== 'application/octet-stream' && mimeType !== '') {
    return mimeType
  }
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MIME[ext] || mimeType || 'application/octet-stream'
}

function detectKind(mimeType: string | undefined, name: string): PreviewKind {
  const mime = resolveMime(mimeType, name).toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('text/') || /\.(txt|md|csv|json|log|xml|yml|yaml)$/i.test(name)) return 'text'
  return 'other'
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['o', 'Ko', 'Mo', 'Go']
  let size = bytes
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toFixed(size >= 100 || index === 0 ? 0 : 1)} ${units[index]}`
}

export default function AttachmentLightbox({ messageId, attachments, initialIndex, onClose }: AttachmentLightboxProps) {
  const [index, setIndex] = useState(initialIndex)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentUrlRef = useRef<string | null>(null)

  const current = attachments[index]
  const kind = current ? detectKind(current.mimeType, current.originalName) : 'other'

  useEffect(() => {
    setIndex(initialIndex)
  }, [initialIndex, messageId])

  useEffect(() => {
    if (!messageId || !current) return

    let canceled = false
    setLoading(true)
    setError(null)
    setTextContent(null)
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current)
      currentUrlRef.current = null
    }
    setBlobUrl(null)

    downloadMessageAttachment(messageId, index)
      .then(async ({ blob }) => {
        if (canceled) return
        if (kind === 'text') {
          const text = await blob.text()
          if (!canceled) setTextContent(text.slice(0, 200_000))
        } else {
          const url = URL.createObjectURL(blob)
          if (canceled) {
            URL.revokeObjectURL(url)
            return
          }
          currentUrlRef.current = url
          setBlobUrl(url)
        }
      })
      .catch((err) => {
        if (!canceled) setError(err instanceof Error ? err.message : 'Impossible de charger le fichier')
      })
      .finally(() => {
        if (!canceled) setLoading(false)
      })

    return () => {
      canceled = true
    }
  }, [messageId, index, current, kind])

  useEffect(() => () => {
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current)
      currentUrlRef.current = null
    }
  }, [])

  const goPrev = useCallback(() => {
    setIndex((prev) => (prev > 0 ? prev - 1 : prev))
  }, [])
  const goNext = useCallback(() => {
    setIndex((prev) => (prev < attachments.length - 1 ? prev + 1 : prev))
  }, [attachments.length])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') goPrev()
      if (event.key === 'ArrowRight') goNext()
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [onClose, goPrev, goNext])

  const handleDownload = useCallback(async () => {
    if (!messageId || !current) return
    try {
      const { blob, filename } = await downloadMessageAttachment(messageId, index)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename || current.originalName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('Téléchargement impossible')
    }
  }, [messageId, current, index])

  if (!current) return null

  // Portalisé sur document.body pour échapper aux contraintes overflow/transform
  // des parents (ex. la conversation est dans un panel avec backdrop-filter qui
  // crée un contexte de stacking et limite la portée d'un position:fixed).
  return createPortal(
    <div className="attachment-lightbox" role="dialog" aria-modal="true" aria-label={current.originalName}>
      <div className="attachment-lightbox__overlay" onClick={onClose} aria-hidden="true" />

      <div className="attachment-lightbox__topbar">
        <div className="attachment-lightbox__meta">
          <strong title={current.originalName}>{current.originalName}</strong>
          <span>
            {attachments.length > 1 ? `${index + 1} / ${attachments.length} · ` : ''}
            {current.mimeType?.split('/').pop()?.toUpperCase() || 'FICHIER'}
            {current.size ? ` · ${formatFileSize(current.size)}` : ''}
          </span>
        </div>
        <div className="attachment-lightbox__actions">
          <button type="button" className="attachment-lightbox__action" onClick={handleDownload} aria-label="Télécharger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button type="button" className="attachment-lightbox__action" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="attachment-lightbox__stage" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
        {attachments.length > 1 && (
          <button
            type="button"
            className="attachment-lightbox__nav attachment-lightbox__nav--prev"
            onClick={goPrev}
            disabled={index === 0}
            aria-label="Précédent"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        <div className="attachment-lightbox__content" onClick={(event) => event.stopPropagation()}>
          {loading && (
            <div className="attachment-lightbox__loader">
              <span className="messaging-spinner" aria-hidden="true" />
              <p>Chargement du fichier…</p>
            </div>
          )}
          {error && !loading && (
            <div className="attachment-lightbox__error">
              <p>{error}</p>
              <button type="button" className="confirm-modal__btn confirm-modal__btn--info" onClick={handleDownload}>
                Télécharger à la place
              </button>
            </div>
          )}
          {!loading && !error && blobUrl && kind === 'image' && (
            <img src={blobUrl} alt={current.originalName} className="attachment-lightbox__image" />
          )}
          {!loading && !error && blobUrl && kind === 'video' && (
            <video src={blobUrl} controls playsInline className="attachment-lightbox__video">
              Votre navigateur ne supporte pas la lecture vidéo.
            </video>
          )}
          {!loading && !error && blobUrl && kind === 'audio' && (
            <div className="attachment-lightbox__audio">
              <div className="attachment-lightbox__audio-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <audio src={blobUrl} controls className="attachment-lightbox__audio-player" />
            </div>
          )}
          {!loading && !error && blobUrl && kind === 'pdf' && (
            <iframe src={blobUrl} title={current.originalName} className="attachment-lightbox__pdf" />
          )}
          {!loading && !error && textContent !== null && kind === 'text' && (
            <pre className="attachment-lightbox__text">{textContent}</pre>
          )}
          {!loading && !error && kind === 'other' && (
            <div className="attachment-lightbox__other">
              <div className="attachment-lightbox__other-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <p>Aperçu non disponible pour ce type de fichier.</p>
              <button type="button" className="confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--info" onClick={handleDownload}>
                Télécharger {current.originalName}
              </button>
            </div>
          )}
        </div>

        {attachments.length > 1 && (
          <button
            type="button"
            className="attachment-lightbox__nav attachment-lightbox__nav--next"
            onClick={goNext}
            disabled={index === attachments.length - 1}
            aria-label="Suivant"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}
