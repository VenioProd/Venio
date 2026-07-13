import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import UserAvatar from './UserAvatar'
import '../styles/project-chat.css'

interface MessageSender {
  _id: string
  name: string
  role: string
  avatarUrl?: string
}

interface ChatMessage {
  _id: string
  content: string
  sender: MessageSender
  createdAt: string
}

interface ClientProjectChatProps {
  projectId: string
  canComment?: boolean
}

const ClientProjectChat = ({ projectId, canComment = true }: ClientProjectChatProps) => {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }

  const fetchMessages = async () => {
    try {
      const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/projects/${projectId}/messages`)
      setMessages(data.messages || [])
    } catch {
      // ignore fetch errors during polling
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, 10000)
    return () => clearInterval(interval)
  }, [projectId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    const content = newMessage.trim()
    if (!content || sending || !canComment) return

    setSending(true)
    try {
      await apiFetch(`/api/projects/${projectId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
      setNewMessage('')
      await fetchMessages()
    } catch {
      // error handled silently
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    }
    if (diffDays === 1) {
      return `Hier ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    }
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getRoleBadge = (role: string) => {
    if (role === 'CLIENT') return 'Client'
    if (role === 'SUPER_ADMIN') return 'Super Admin'
    if (role === 'ADMIN') return 'Admin'
    if (role === 'VIEWER') return 'Viewer'
    return role
  }

  const isOwnMessage = (msg: ChatMessage) => {
    return msg.sender._id === user?._id
  }

  if (loading) {
    return (
      <div className="project-chat">
        <div className="project-chat-loading">Chargement des messages...</div>
      </div>
    )
  }

  return (
    <div className="project-chat">
      <div className="project-chat-messages" ref={containerRef}>
        {messages.length === 0 ? (
          <div className="project-chat-empty">
            <div className="project-chat-empty-icon">💬</div>
            <p>Aucun message pour le moment</p>
            <p className="project-chat-empty-sub">
              {canComment ? 'Envoyez un message a votre equipe projet.' : 'Vous avez un accès en lecture seule.'}
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg._id} className={`project-chat-message ${isOwnMessage(msg) ? 'own' : ''}`}>
              {!isOwnMessage(msg) && (
                <UserAvatar
                  name={msg.sender.name}
                  avatarUrl={msg.sender.avatarUrl}
                  className="project-chat-avatar"
                  size={32}
                />
              )}
              <div className="project-chat-bubble">
                <div className="project-chat-sender">
                  <span className="project-chat-sender-name">{msg.sender.name}</span>
                  <span className={`project-chat-role-badge ${msg.sender.role === 'CLIENT' ? 'client' : 'admin'}`}>
                    {getRoleBadge(msg.sender.role)}
                  </span>
                </div>
                <div className="project-chat-content">{msg.content}</div>
                <div className="project-chat-time">{formatTime(msg.createdAt)}</div>
              </div>
              {isOwnMessage(msg) && (
                <UserAvatar
                  name={msg.sender.name}
                  avatarUrl={msg.sender.avatarUrl}
                  className="project-chat-avatar own"
                  size={32}
                />
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="project-chat-input">
        <textarea
          className="project-chat-textarea"
          placeholder={canComment ? 'Ecrire un message...' : 'Lecture seule'}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={sending || !canComment}
        />
        <button
          className="project-chat-send"
          onClick={handleSend}
          disabled={!newMessage.trim() || sending || !canComment}
        >
          {sending ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" opacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 12 12"
                  to="360 12 12"
                  dur="1s"
                  repeatCount="indefinite"
                />
              </path>
            </svg>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

export default ClientProjectChat
