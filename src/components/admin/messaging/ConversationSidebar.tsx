import type { InternalConversation, MessagingUser } from '../../../types/messaging.types'

interface ConversationSidebarProps {
  conversations: InternalConversation[]
  users: MessagingUser[]
  activeConversationId: string | null
  onSelect: (id: string) => void
  onCreateChannel: (name: string, visibility: 'PUBLIC' | 'PRIVATE') => void
  onOpenDirect: (userId: string) => void
}

function getConversationLabel(conversation: InternalConversation): string {
  if (conversation.type === 'CHANNEL') return `# ${conversation.slug || conversation.name}`
  if (conversation.type === 'DM') return conversation.name || 'Message direct'
  return conversation.name || 'Groupe'
}

export default function ConversationSidebar({
  conversations,
  users,
  activeConversationId,
  onSelect,
  onCreateChannel,
  onOpenDirect,
}: ConversationSidebarProps) {
  const channels = conversations.filter((conversation) => conversation.type === 'CHANNEL')
  const directs = conversations.filter((conversation) => conversation.type !== 'CHANNEL')

  return (
    <aside className="messaging-sidebar">
      <div className="messaging-sidebar-section">
        <div className="messaging-sidebar-heading">
          <span>Channels</span>
          <button
            type="button"
            title="Créer un channel"
            onClick={() => {
              const name = window.prompt('Nom du channel')
              if (name?.trim()) onCreateChannel(name.trim(), 'PUBLIC')
            }}
          >
            +
          </button>
        </div>
        {channels.map((conversation) => (
          <button
            key={conversation._id}
            type="button"
            className={`messaging-conversation ${activeConversationId === conversation._id ? 'active' : ''}`}
            onClick={() => onSelect(conversation._id)}
          >
            <span>{getConversationLabel(conversation)}</span>
            {conversation.unreadCount > 0 && <strong>{conversation.unreadCount}</strong>}
          </button>
        ))}
      </div>

      <div className="messaging-sidebar-section">
        <div className="messaging-sidebar-heading">
          <span>Messages directs</span>
        </div>
        {directs.map((conversation) => (
          <button
            key={conversation._id}
            type="button"
            className={`messaging-conversation ${activeConversationId === conversation._id ? 'active' : ''}`}
            onClick={() => onSelect(conversation._id)}
          >
            <span>{getConversationLabel(conversation)}</span>
            {conversation.unreadCount > 0 && <strong>{conversation.unreadCount}</strong>}
          </button>
        ))}
        <select
          className="messaging-user-select"
          value=""
          onChange={(event) => {
            if (event.target.value) onOpenDirect(event.target.value)
          }}
          aria-label="Ouvrir un message direct"
        >
          <option value="">Nouveau DM...</option>
          {users.map((user) => (
            <option key={user._id} value={user._id}>{user.name} · {user.role}</option>
          ))}
        </select>
      </div>
    </aside>
  )
}
