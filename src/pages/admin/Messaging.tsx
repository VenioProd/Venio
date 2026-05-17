import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ConversationHeader from '../../components/admin/messaging/ConversationHeader'
import ConversationSidebar from '../../components/admin/messaging/ConversationSidebar'
import MessageComposer from '../../components/admin/messaging/MessageComposer'
import MessageList from '../../components/admin/messaging/MessageList'
import { MessagingProvider, useMessaging } from '../../context/MessagingContext'
import { createChannel, fetchMessagingUsers, openDirectConversation, searchMessages } from '../../services/messaging'
import type { MessagingSearchResult, MessagingUser } from '../../types/messaging.types'
import './Messaging.css'

function MessagingSurface() {
  const [users, setUsers] = useState<MessagingUser[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MessagingSearchResult[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    conversations,
    activeConversationId,
    messages,
    loading,
    connected,
    typingUsers,
    setActiveConversationId,
    refreshConversations,
    loadMessages,
    sendMessage,
    emitTyping,
    replaceMessage,
  } = useMessaging()

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation._id === activeConversationId) || null,
    [conversations, activeConversationId]
  )

  useEffect(() => {
    fetchMessagingUsers().then(setUsers).catch(() => setUsers([]))
  }, [])

  useEffect(() => {
    const conversationId = searchParams.get('conversation')
    if (conversationId) setActiveConversationId(conversationId)
  }, [searchParams, setActiveConversationId])

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const timeout = setTimeout(() => {
      searchMessages(query).then(setResults).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(timeout)
  }, [query])

  const selectConversation = (id: string) => {
    setActiveConversationId(id)
    setSearchParams({ conversation: id })
  }

  return (
    <div className="messaging-page">
      <ConversationSidebar
        conversations={conversations}
        users={users}
        activeConversationId={activeConversationId}
        onSelect={selectConversation}
        onCreateChannel={async (name, visibility) => {
          const conversation = await createChannel({ name, visibility })
          await refreshConversations()
          selectConversation(conversation._id)
        }}
        onOpenDirect={async (userId) => {
          const conversation = await openDirectConversation(userId)
          await refreshConversations()
          selectConversation(conversation._id)
        }}
      />
      <main className="messaging-main">
        <ConversationHeader conversation={activeConversation} connected={connected} />
        <div className="messaging-search">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher dans les messages..."
          />
          {results.length > 0 && (
            <div className="messaging-search-results">
              {results.map((result) => (
                <button
                  key={result._id}
                  type="button"
                  onClick={() => {
                    selectConversation(String(result.conversation))
                    setQuery('')
                  }}
                >
                  <strong>{result.sender.name}</strong>
                  <span>{result.content}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <section className="messaging-thread">
          {loading ? (
            <div className="messaging-empty"><p>Chargement...</p></div>
          ) : (
            <MessageList messages={messages} typingUsers={typingUsers} onReplaceMessage={replaceMessage} />
          )}
        </section>
        <MessageComposer
          conversationId={activeConversationId}
          users={users}
          onSend={sendMessage}
          onUploaded={async () => {
            if (activeConversationId) await loadMessages(activeConversationId)
            await refreshConversations()
          }}
          onTyping={emitTyping}
        />
      </main>
    </div>
  )
}

export default function Messaging() {
  return (
    <MessagingProvider>
      <MessagingSurface />
    </MessagingProvider>
  )
}
