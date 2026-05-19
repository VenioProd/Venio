import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { getToken } from '../../../lib/api'
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

async function openAttachment(messageId: string, index: number, originalName: string, mimeType: string) {
  const token = getToken()
  const url = `/api/admin/messaging/messages/${messageId}/attachments/${index}/download`
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) return
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const viewable = mimeType?.startsWith('image/') || mimeType === 'application/pdf' || mimeType?.startsWith('video/')
  if (viewable) {
    window.open(objectUrl, '_blank')
  } else {
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = originalName
    a.click()
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
}

export default function MessageList({ messages, typingUsers, onReplaceMessage }: MessageListProps) {
  const { user } = useAuth()
  const endRef = useRef<HTMLDivElement>(null)
  const [openActionsId, setOpenActionsId] = useState<string | null>(null)
  const typingNames = Object.values(typingUsers)

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
                          onClick={() => openAttachment(message._id, attachmentIndex, attachment.originalName, attachment.mimeType)}
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
    </div>
  )
}
