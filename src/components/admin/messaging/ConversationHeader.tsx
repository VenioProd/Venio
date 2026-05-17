import type { InternalConversation } from '../../../types/messaging.types'

interface ConversationHeaderProps {
  conversation: InternalConversation | null
  connected: boolean
}

export default function ConversationHeader({ conversation, connected }: ConversationHeaderProps) {
  if (!conversation) {
    return (
      <header className="messaging-header">
        <div>
          <h1>Messagerie</h1>
          <p>Sélectionnez une conversation.</p>
        </div>
      </header>
    )
  }

  const title = conversation.type === 'CHANNEL'
    ? `# ${conversation.slug || conversation.name}`
    : conversation.name || (conversation.type === 'DM' ? 'Message direct' : 'Groupe')

  return (
    <header className="messaging-header">
      <div>
        <h1>{title}</h1>
        <p>{conversation.visibility === 'PUBLIC' ? 'Channel public' : 'Conversation privée'}</p>
      </div>
      <span className={`messaging-connection ${connected ? 'online' : 'offline'}`}>
        {connected ? 'Temps réel actif' : 'Reconnexion...'}
      </span>
    </header>
  )
}
