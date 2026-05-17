import { useEffect, useRef } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { deleteMessage, editMessage, toggleReaction } from '../../../services/messaging'
import type { InternalMessage } from '../../../types/messaging.types'

interface MessageListProps {
  messages: InternalMessage[]
  typingUsers: Record<string, string>
  onReplaceMessage: (message: InternalMessage) => void
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getInitials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2)
}

export default function MessageList({ messages, typingUsers, onReplaceMessage }: MessageListProps) {
  const { user } = useAuth()
  const endRef = useRef<HTMLDivElement>(null)
  const typingNames = Object.values(typingUsers)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="messaging-empty">
        <h2>Aucun message</h2>
        <p>Commencez la discussion interne ici.</p>
      </div>
    )
  }

  return (
    <div className="messaging-list">
      {messages.map((message) => {
        const isOwn = message.sender._id === user?._id
        return (
          <article key={message._id} className={`messaging-message ${isOwn ? 'own' : ''}`}>
            <div className="messaging-avatar">{getInitials(message.sender.name)}</div>
            <div className="messaging-message-body">
              <div className="messaging-message-meta">
                <strong>{message.sender.name}</strong>
                <span>{formatTime(message.createdAt)}</span>
                {message.editedAt && <span>modifié</span>}
              </div>
              <p>{message.content}</p>
              {message.attachments.length > 0 && (
                <div className="messaging-attachments">
                  {message.attachments.map((attachment, index) => (
                    <a
                      key={`${message._id}-${attachment.originalName}`}
                      href={`/api/admin/messaging/messages/${message._id}/attachments/${index}/download`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {attachment.originalName}
                    </a>
                  ))}
                </div>
              )}
              {message.reactions.length > 0 && (
                <div className="messaging-reactions">
                  {message.reactions.map((reaction) => (
                    <button
                      key={reaction.emoji}
                      type="button"
                      onClick={async () => onReplaceMessage(await toggleReaction(message._id, reaction.emoji))}
                    >
                      {reaction.emoji} {reaction.users.length}
                    </button>
                  ))}
                </div>
              )}
              <div className="messaging-message-actions">
                <button type="button" onClick={async () => onReplaceMessage(await toggleReaction(message._id, '👍'))}>👍</button>
                {isOwn && !message.deletedAt && (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        const content = window.prompt('Modifier le message', message.content)
                        if (content?.trim()) onReplaceMessage(await editMessage(message._id, content.trim()))
                      }}
                    >
                      Modifier
                    </button>
                    <button type="button" onClick={async () => onReplaceMessage(await deleteMessage(message._id))}>Supprimer</button>
                  </>
                )}
              </div>
            </div>
          </article>
        )
      })}
      {typingNames.length > 0 && (
        <div className="messaging-typing">{typingNames.join(', ')} écrit...</div>
      )}
      <div ref={endRef} />
    </div>
  )
}
