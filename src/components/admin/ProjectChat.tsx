import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { formatDate, formatTime as formatClock } from '../../i18n/format'
import '../../styles/project-chat.css'

interface MessageSender {
  _id: string
  name: string
  email?: string
  role: string
}

interface ChatMessage {
  _id: string
  content: string
  sender: MessageSender
  createdAt: string
}

interface ProjectChatProps {
  projectId: string
}

const ProjectChat = ({ projectId }: ProjectChatProps) => {
  const { t } = useI18n()
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
      const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/admin/projects/${projectId}/messages`)
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
    if (!content || sending) return

    setSending(true)
    try {
      await apiFetch(`/api/admin/projects/${projectId}/messages`, {
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
      return formatClock(date, { hour: '2-digit', minute: '2-digit' })
    }
    if (diffDays === 1) {
      return t('compB.chat.yesterdayAt', { time: formatClock(date, { hour: '2-digit', minute: '2-digit' }) })
    }
    return formatDate(date, {
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
    if (role === 'CLIENT') return t('compB.chat.roleClient')
    if (role === 'SUPER_ADMIN') return t('compB.chat.roleSuperAdmin')
    if (role === 'ADMIN') return t('compB.chat.roleAdmin')
    if (role === 'VIEWER') return t('compB.chat.roleViewer')
    return role
  }

  const isOwnMessage = (msg: ChatMessage) => {
    return msg.sender._id === user?._id
  }

  if (loading) {
    return (
      <div className="project-chat">
        <div className="project-chat-loading">{t('compB.chat.loading')}</div>
      </div>
    )
  }

  return (
    <div className="project-chat">
      <div className="project-chat-messages" ref={containerRef}>
        {messages.length === 0 ? (
          <div className="project-chat-empty">
            <div className="project-chat-empty-icon">💬</div>
            <p>{t('compB.chat.emptyTitle')}</p>
            <p className="project-chat-empty-sub">{t('compB.chat.emptyHint')}</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg._id} className={`project-chat-message ${isOwnMessage(msg) ? 'own' : ''}`}>
              {!isOwnMessage(msg) && <div className="project-chat-avatar">{getInitials(msg.sender.name)}</div>}
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
              {isOwnMessage(msg) && <div className="project-chat-avatar own">{getInitials(msg.sender.name)}</div>}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="project-chat-input">
        <textarea
          className="project-chat-textarea"
          placeholder={t('compB.chat.placeholder')}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={sending}
        />
        <button className="project-chat-send" onClick={handleSend} disabled={!newMessage.trim() || sending}>
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

export default ProjectChat
