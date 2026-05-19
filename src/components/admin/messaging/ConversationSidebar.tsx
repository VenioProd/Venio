import { useMemo, useState } from 'react'
import PromptModal from '../../PromptModal'
import type { InternalConversation, MessagingUser } from '../../../types/messaging.types'

interface ConversationSidebarProps {
  conversations: InternalConversation[]
  users: MessagingUser[]
  activeConversationId: string | null
  onSelect: (id: string) => void
  onCreateChannel: (name: string, visibility: 'PUBLIC' | 'PRIVATE') => void
  onOpenDirect: (userId: string) => Promise<void>
}

function getConversationLabel(conversation: InternalConversation): string {
  if (conversation.type === 'CHANNEL') return conversation.slug || conversation.name
  if (conversation.type === 'DM') return conversation.name || 'Message direct'
  return conversation.name || 'Groupe'
}

function getInitials(value: string): string {
  return value
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

function formatLastTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Hier'
  }
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000)
  if (diffDays < 7) {
    return date.toLocaleDateString('fr-FR', { weekday: 'short' })
  }
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

export default function ConversationSidebar({
  conversations,
  users,
  activeConversationId,
  onSelect,
  onCreateChannel,
  onOpenDirect,
}: ConversationSidebarProps) {
  const [filter, setFilter] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null)
  const [channelPrompt, setChannelPrompt] = useState<'PUBLIC' | 'PRIVATE' | null>(null)

  const channels = useMemo(
    () => conversations.filter((conversation) => conversation.type === 'CHANNEL'),
    [conversations]
  )
  const directs = useMemo(
    () => conversations.filter((conversation) => conversation.type !== 'CHANNEL'),
    [conversations]
  )

  const filterText = filter.trim().toLowerCase()
  const filterConversation = (conversation: InternalConversation) => {
    if (!filterText) return true
    return getConversationLabel(conversation).toLowerCase().includes(filterText)
  }

  const filteredChannels = channels.filter(filterConversation)
  const filteredDirects = directs.filter(filterConversation)
  const filteredUsers = filterText
    ? users.filter((user) => user.name.toLowerCase().includes(filterText) || user.email.toLowerCase().includes(filterText))
    : users

  const renderConversation = (conversation: InternalConversation) => {
    const isActive = activeConversationId === conversation._id
    const label = getConversationLabel(conversation)
    const isChannel = conversation.type === 'CHANNEL'
    const hue = hashHue(conversation._id)
    const preview = conversation.lastMessage?.content || (isChannel ? 'Channel' : 'Conversation directe')

    return (
      <button
        key={conversation._id}
        type="button"
        className={`messaging-conversation${isActive ? ' active' : ''}${conversation.unreadCount > 0 ? ' unread' : ''}`}
        onClick={() => onSelect(conversation._id)}
      >
        <span
          className={`messaging-conversation-avatar ${isChannel ? 'is-channel' : 'is-dm'}`}
          style={isChannel ? undefined : { background: `linear-gradient(135deg, hsl(${hue} 80% 55%), hsl(${(hue + 40) % 360} 70% 45%))` }}
          aria-hidden="true"
        >
          {isChannel ? '#' : getInitials(label)}
        </span>
        <span className="messaging-conversation-body">
          <span className="messaging-conversation-row">
            <span className="messaging-conversation-name">{label}</span>
            <span className="messaging-conversation-time">{formatLastTime(conversation.lastMessageAt)}</span>
          </span>
          <span className="messaging-conversation-row">
            <span className="messaging-conversation-preview">{preview}</span>
            {conversation.unreadCount > 0 && (
              <span className="messaging-conversation-badge">{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>
            )}
          </span>
        </span>
      </button>
    )
  }

  return (
    <aside className="messaging-sidebar">
      <div className="messaging-sidebar-top">
        <div className="messaging-sidebar-title">
          <span className="messaging-sidebar-title-dot" aria-hidden="true" />
          <h2>Messagerie</h2>
        </div>
        <button
          type="button"
          className="messaging-sidebar-new"
          aria-label="Nouvelle conversation"
          onClick={() => setPickerOpen((value) => !value)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
        </button>
      </div>

      <div className="messaging-sidebar-filter">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filtrer…"
          aria-label="Filtrer les conversations"
        />
      </div>

      {pickerOpen && (
        <div className="messaging-sidebar-picker">
          <button
            type="button"
            className="messaging-sidebar-picker-item"
            onClick={() => {
              setChannelPrompt('PUBLIC')
              setPickerOpen(false)
            }}
          >
            <span className="messaging-sidebar-picker-icon">#</span>
            <span>
              <strong>Créer un channel</strong>
              <small>Public, visible par tous</small>
            </span>
          </button>
          <button
            type="button"
            className="messaging-sidebar-picker-item"
            onClick={() => {
              setChannelPrompt('PRIVATE')
              setPickerOpen(false)
            }}
          >
            <span className="messaging-sidebar-picker-icon">🔒</span>
            <span>
              <strong>Channel privé</strong>
              <small>Sur invitation</small>
            </span>
          </button>
        </div>
      )}

      <PromptModal
        isOpen={channelPrompt !== null}
        title={channelPrompt === 'PRIVATE' ? 'Nouveau channel privé' : 'Nouveau channel public'}
        message={channelPrompt === 'PRIVATE' ? 'Sur invitation uniquement.' : 'Visible par tous les membres.'}
        placeholder="ex. design-system"
        confirmLabel="Créer"
        maxLength={48}
        validate={(value) => (value.length < 2 ? 'Au moins 2 caractères' : null)}
        onConfirm={(name) => {
          if (channelPrompt) onCreateChannel(name, channelPrompt)
          setChannelPrompt(null)
        }}
        onCancel={() => setChannelPrompt(null)}
      />

      <div className="messaging-sidebar-scroll">
        <div className="messaging-sidebar-section">
          <div className="messaging-sidebar-heading">
            <span>Channels</span>
            <span className="messaging-sidebar-count">{filteredChannels.length}</span>
          </div>
          {filteredChannels.length === 0 ? (
            <p className="messaging-sidebar-placeholder">Aucun channel</p>
          ) : (
            filteredChannels.map(renderConversation)
          )}
        </div>

        <div className="messaging-sidebar-section">
          <div className="messaging-sidebar-heading">
            <span>Messages directs</span>
            <span className="messaging-sidebar-count">{filteredDirects.length}</span>
          </div>
          {filteredDirects.length === 0 ? (
            <p className="messaging-sidebar-placeholder">Aucun DM</p>
          ) : (
            filteredDirects.map(renderConversation)
          )}
        </div>

        <div className="messaging-sidebar-section">
          <div className="messaging-sidebar-heading">
            <span>Démarrer un DM</span>
          </div>
          <div className="messaging-sidebar-people">
            {filteredUsers.length === 0 ? (
              <p className="messaging-sidebar-placeholder">Aucun utilisateur</p>
            ) : (
              filteredUsers.slice(0, 12).map((user) => {
                const hue = hashHue(user._id)
                return (
                  <button
                    key={user._id}
                    type="button"
                    className={`messaging-sidebar-person${loadingUserId === user._id ? ' loading' : ''}`}
                    disabled={loadingUserId !== null}
                    onClick={async () => {
                      setLoadingUserId(user._id)
                      try {
                        await onOpenDirect(user._id)
                      } finally {
                        setLoadingUserId(null)
                      }
                    }}
                  >
                    <span
                      className="messaging-conversation-avatar is-dm"
                      style={{ background: `linear-gradient(135deg, hsl(${hue} 80% 55%), hsl(${(hue + 40) % 360} 70% 45%))` }}
                      aria-hidden="true"
                    >
                      {getInitials(user.name)}
                    </span>
                    <span className="messaging-sidebar-person-body">
                      <span className="messaging-sidebar-person-name">{user.name}</span>
                      <span className="messaging-sidebar-person-role">{user.role}</span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
