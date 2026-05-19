import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../../context/AuthContext'
import { getToken } from '../../../lib/api'
import { useToast } from '../../../context/ToastContext'
import { deleteMessage, editMessage, toggleReaction } from '../../../services/messaging'
import type { InternalMessage } from '../../../types/messaging.types'

interface MessageListProps {
  messages: InternalMessage[]
  typingUsers: Record<string, string>
  onReplaceMessage: (message: InternalMessage) => void
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏']

function formatHour(value: string): string {
  return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function formatDateLabel(value: string): string {
  const date = new Date(value)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) return "Aujourd'hui"
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Hier'
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function hashHue(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash) % 360
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

interface AttachmentPreview {
  objectUrl: string
  name: string
  mimeType: string
}

async function fetchAttachmentBlob(messageId: string, index: number): Promise<{ blob: Blob; error?: never } | { error: string; blob?: never }> {
  const token = getToken()
  const url = `/api/admin/messaging/messages/${messageId}/attachments/${index}/download`
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    return { error: (data as Record<string, string>)?.error || `Erreur ${res.status}` }
  }
  return { blob: await res.blob() }
}

function downloadBlob(objectUrl: string, name: string) {
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
}

function resolveMime(mimeType: string, name: string): string {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MIME[ext] || mimeType
}

function AttachmentPreviewModal({ preview, onClose }: { preview: AttachmentPreview; onClose: () => void }) {
  const mime = resolveMime(preview.mimeType, preview.name)
  const isImage = mime.startsWith('image/')
  const isPdf = mime === 'application/pdf'
  const isVideo = mime.startsWith('video/')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <>
      <div className="attachment-modal-backdrop" onClick={onClose} style={{ cursor: 'default' }} />
      <div className="attachment-modal" onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 2001 }}>
        <div className="attachment-modal-header">
          <span className="attachment-modal-name">{preview.name}</span>
          <div className="attachment-modal-actions">
            <button type="button" className="attachment-modal-btn" onClick={() => downloadBlob(preview.objectUrl, preview.name)} title="Télécharger">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button type="button" className="attachment-modal-btn attachment-modal-close" onClick={onClose} title="Fermer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="attachment-modal-body">
          {isImage && <img src={preview.objectUrl} alt={preview.name} className="attachment-preview-img" />}
          {isPdf && <iframe src={preview.objectUrl} title={preview.name} className="attachment-preview-iframe" />}
          {isVideo && <video src={preview.objectUrl} controls className="attachment-preview-video" />}
          {!isImage && !isPdf && !isVideo && (
            <div className="attachment-preview-generic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="64" height="64">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p>{preview.name}</p>
              <button type="button" className="attachment-download-btn" onClick={() => downloadBlob(preview.objectUrl, preview.name)}>
                Télécharger
              </button>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}

export default function MessageList({ messages, typingUsers, onReplaceMessage }: MessageListProps) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const endRef = useRef<HTMLDivElement>(null)
  const [openActionsId, setOpenActionsId] = useState<string | null>(null)
  const [preview, setPreview] = useState<AttachmentPreview | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const typingNames = Object.values(typingUsers)

  const closePreview = () => {
    setPreview(null)
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }

  const handleAttachmentClick = async (messageId: string, index: number, name: string, mimeType: string) => {
    const result = await fetchAttachmentBlob(messageId, index)
    if (result.error || !result.blob) { showToast(result.error ?? 'Erreur', 'error'); return }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const objectUrl = URL.createObjectURL(result.blob)
    previewUrlRef.current = objectUrl
    setPreview({ objectUrl, name, mimeType })
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="messaging-empty">
        <div className="messaging-empty-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h2>Aucun message</h2>
        <p>Lancez la conversation, vos coéquipiers recevront une notification.</p>
      </div>
    )
  }

  return (
    <div className="messaging-list">
      {messages.map((message, index) => {
        const isOwn = message.sender._id === user?._id
        const previous = index > 0 ? messages[index - 1] : null
        const currentDate = new Date(message.createdAt).toDateString()
        const previousDate = previous ? new Date(previous.createdAt).toDateString() : null
        const newDay = currentDate !== previousDate
        const sameSenderAsPrevious =
          !newDay &&
          previous &&
          previous.sender._id === message.sender._id &&
          new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60 * 1000
        const hue = hashHue(message.sender._id)

        return (
          <div key={message._id}>
            {newDay && (
              <div className="messaging-day-separator">
                <span>{formatDateLabel(message.createdAt)}</span>
              </div>
            )}
            <article
              className={`messaging-message${isOwn ? ' own' : ''}${sameSenderAsPrevious ? ' grouped' : ''}`}
              onMouseLeave={() => setOpenActionsId((value) => (value === message._id ? null : value))}
            >
              {!sameSenderAsPrevious ? (
                <div
                  className="messaging-avatar"
                  style={{ background: `linear-gradient(135deg, hsl(${hue} 80% 55%), hsl(${(hue + 40) % 360} 70% 45%))` }}
                  aria-hidden="true"
                >
                  {getInitials(message.sender.name)}
                </div>
              ) : (
                <div className="messaging-avatar messaging-avatar-spacer" aria-hidden="true">
                  <span className="messaging-avatar-time">{formatHour(message.createdAt)}</span>
                </div>
              )}
              <div className="messaging-message-body">
                {!sameSenderAsPrevious && (
                  <div className="messaging-message-meta">
                    <strong>{message.sender.name}</strong>
                    <span className="messaging-message-time">{formatHour(message.createdAt)}</span>
                    {message.editedAt && <span className="messaging-message-tag">modifié</span>}
                    {message.deletedAt && <span className="messaging-message-tag danger">supprimé</span>}
                  </div>
                )}
                <div className="messaging-bubble">
                  {message.deletedAt ? (
                    <p className="messaging-bubble-deleted">Ce message a été supprimé.</p>
                  ) : (
                    <p>{message.content}</p>
                  )}
                  {!message.deletedAt && message.attachments.length > 0 && (
                    <div className="messaging-attachments">
                      {message.attachments.map((attachment, attachmentIndex) => (
                        <button
                          key={`${message._id}-${attachment.originalName}-${attachmentIndex}`}
                          type="button"
                          className="messaging-attachment"
                          onClick={() => handleAttachmentClick(message._id, attachmentIndex, attachment.originalName, attachment.mimeType)}
                        >
                          <span className="messaging-attachment-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.4 18.21a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                          </span>
                          <span className="messaging-attachment-body">
                            <span className="messaging-attachment-name">{attachment.originalName}</span>
                            <span className="messaging-attachment-meta">
                              {attachment.mimeType?.split('/').pop()?.toUpperCase() || 'FICHIER'}
                              {attachment.size ? ` · ${formatFileSize(attachment.size)}` : ''}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!message.deletedAt && message.reactions.length > 0 && (
                  <div className="messaging-reactions">
                    {message.reactions.map((reaction) => {
                      const reacted = user ? reaction.users.includes(user._id) : false
                      return (
                        <button
                          key={reaction.emoji}
                          type="button"
                          className={`messaging-reaction ${reacted ? 'active' : ''}`}
                          onClick={async () => onReplaceMessage(await toggleReaction(message._id, reaction.emoji))}
                        >
                          <span>{reaction.emoji}</span>
                          <span>{reaction.users.length}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {!message.deletedAt && (
                  <div className={`messaging-message-actions ${openActionsId === message._id ? 'open' : ''}`}>
                    <button
                      type="button"
                      className="messaging-message-toggle"
                      aria-label="Réagir"
                      onClick={() => setOpenActionsId((value) => (value === message._id ? null : message._id))}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                        <line x1="9" y1="9" x2="9.01" y2="9" />
                        <line x1="15" y1="9" x2="15.01" y2="9" />
                      </svg>
                    </button>
                    <div className="messaging-message-actions-menu">
                      {QUICK_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="messaging-quick-reaction"
                          onClick={async () => {
                            const updated = await toggleReaction(message._id, emoji)
                            onReplaceMessage(updated)
                            setOpenActionsId(null)
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                      {isOwn && (
                        <>
                          <div className="messaging-actions-divider" aria-hidden="true" />
                          <button
                            type="button"
                            className="messaging-message-action-btn"
                            onClick={async () => {
                              const content = window.prompt('Modifier le message', message.content)
                              if (content?.trim()) onReplaceMessage(await editMessage(message._id, content.trim()))
                              setOpenActionsId(null)
                            }}
                            aria-label="Modifier"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="messaging-message-action-btn danger"
                            onClick={async () => {
                              onReplaceMessage(await deleteMessage(message._id))
                              setOpenActionsId(null)
                            }}
                            aria-label="Supprimer"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </article>
          </div>
        )
      })}
      {typingNames.length > 0 && (
        <div className="messaging-typing" aria-live="polite">
          <span className="messaging-typing-dots" aria-hidden="true">
            <span /><span /><span />
          </span>
          <span>{typingNames.join(', ')} écrit…</span>
        </div>
      )}
      <div ref={endRef} />
      {preview && <AttachmentPreviewModal preview={preview} onClose={closePreview} />}
    </div>
  )
}
