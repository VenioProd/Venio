import type { InternalConversation } from '../../../types/messaging.types'
import { useI18n } from '../../../context/I18nContext'

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
  const { t } = useI18n()
  if (!conversation) {
    return (
      <header className="messaging-header">
        <button
          type="button"
          className="messaging-header-back"
          onClick={onBack}
          aria-label={t('compB.msg.conversations')}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </button>
        <div className="messaging-header-main">
          <h1>{t('compB.msg.title')}</h1>
          <p>{t('compB.msg.selectConversation')}</p>
        </div>
        <span
          className={`messaging-connection ${connected ? 'online' : 'offline'}`}
          title={connected ? t('compB.msg.connected') : t('compB.msg.disconnected')}
        >
          <span className="messaging-connection-dot" aria-hidden="true" />
          <span className="messaging-connection-label">
            {connected ? t('compB.msg.live') : t('compB.msg.reconnecting')}
          </span>
        </span>
      </header>
    )
  }

  const isChannel = conversation.type === 'CHANNEL'
  const title = isChannel
    ? conversation.slug || conversation.name
    : conversation.name || (conversation.type === 'DM' ? t('compB.msg.directMessage') : t('compB.msg.group'))
  const subtitle = isChannel
    ? conversation.visibility === 'PUBLIC'
      ? t('compB.msg.publicChannel')
      : t('compB.msg.privateChannel')
    : conversation.type === 'DM'
      ? t('compB.msg.directConversation')
      : t('compB.msg.privateGroup')
  const hue = hashHue(conversation._id)

  return (
    <header className="messaging-header">
      <button
        type="button"
        className="messaging-header-back"
        onClick={onBack}
        aria-label={t('compB.msg.backToConversations')}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
      </button>
      <span
        className={`messaging-header-avatar ${isChannel ? 'is-channel' : 'is-dm'}`}
        style={
          isChannel
            ? undefined
            : { background: `linear-gradient(135deg, hsl(${hue} 80% 55%), hsl(${(hue + 40) % 360} 70% 45%))` }
        }
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
          aria-label={t('common.search')}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </button>
        <span
          className={`messaging-connection ${connected ? 'online' : 'offline'}`}
          title={connected ? t('compB.msg.connected') : t('compB.msg.disconnected')}
        >
          <span className="messaging-connection-dot" aria-hidden="true" />
          <span className="messaging-connection-label">
            {connected ? t('compB.msg.live') : t('compB.msg.reconnecting')}
          </span>
        </span>
      </div>
    </header>
  )
}
