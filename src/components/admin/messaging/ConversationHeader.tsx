import type { InternalConversation } from '../../../types/messaging.types'

interface ConversationHeaderProps {
  conversation: InternalConversation | null
  connected: boolean
  onBack?: () => void
  onToggleSearch?: () => void
  searchActive?: boolean
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

export default function ConversationHeader({
  conversation,
  connected,
  onBack,
  onToggleSearch,
  searchActive,
}: ConversationHeaderProps) {
  if (!conversation) {
    return (
      <header className="messaging-header">
        <button type="button" className="messaging-header-back" onClick={onBack} aria-label="Conversations">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </button>
        <div className="messaging-header-main">
          <h1>Messagerie</h1>
          <p>Sélectionnez une conversation</p>
        </div>
        <span className={`messaging-connection ${connected ? 'online' : 'offline'}`} title={connected ? 'Connecté' : 'Déconnecté'}>
          <span className="messaging-connection-dot" aria-hidden="true" />
          <span className="messaging-connection-label">{connected ? 'En direct' : 'Reconnexion…'}</span>
        </span>
      </header>
    )
  }

  const isChannel = conversation.type === 'CHANNEL'
  const title = isChannel
    ? conversation.slug || conversation.name
    : conversation.name || (conversation.type === 'DM' ? 'Message direct' : 'Groupe')
  const subtitle = isChannel
    ? conversation.visibility === 'PUBLIC' ? 'Channel public' : 'Channel privé'
    : conversation.type === 'DM' ? 'Conversation directe' : 'Groupe privé'
  const hue = hashHue(conversation._id)

  return (
    <header className="messaging-header">
      <button type="button" className="messaging-header-back" onClick={onBack} aria-label="Retour aux conversations">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
      </button>
      <span
        className={`messaging-header-avatar ${isChannel ? 'is-channel' : 'is-dm'}`}
        style={isChannel ? undefined : { background: `linear-gradient(135deg, hsl(${hue} 80% 55%), hsl(${(hue + 40) % 360} 70% 45%))` }}
        aria-hidden="true"
      >
        {isChannel ? '#' : getInitials(title)}
      </span>
      <div className="messaging-header-main">
        <h1>
          {isChannel && <span className="messaging-header-hash">#</span>}
          {title}
        </h1>
        <p>{subtitle}</p>
      </div>
      <div className="messaging-header-actions">
        <button
          type="button"
          className={`messaging-header-action ${searchActive ? 'active' : ''}`}
          onClick={onToggleSearch}
          aria-label="Rechercher"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </button>
        <span className={`messaging-connection ${connected ? 'online' : 'offline'}`} title={connected ? 'Connecté' : 'Déconnecté'}>
          <span className="messaging-connection-dot" aria-hidden="true" />
          <span className="messaging-connection-label">{connected ? 'En direct' : 'Reconnexion…'}</span>
        </span>
      </div>
    </header>
  )
}
