import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ConversationHeader from '../../components/admin/messaging/ConversationHeader'
import ConversationSidebar from '../../components/admin/messaging/ConversationSidebar'
import MessageComposer from '../../components/admin/messaging/MessageComposer'
import MessageList from '../../components/admin/messaging/MessageList'
import { useMessaging } from '../../context/MessagingContext'
import { createChannel, fetchMessagingUsers, openDirectConversation, searchMessages } from '../../services/messaging'
import type { MessagingSearchResult, MessagingUser } from '../../types/messaging.types'
import './Messaging.css'

type MobileView = 'sidebar' | 'thread'

function MessagingSurface() {
  const [users, setUsers] = useState<MessagingUser[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MessagingSearchResult[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('sidebar')
  const searchInputRef = useRef<HTMLInputElement>(null)
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
    if (conversationId) {
      setActiveConversationId(conversationId)
      setMobileView('thread')
    }
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

  useEffect(() => {
    if (showSearch) {
      requestAnimationFrame(() => searchInputRef.current?.focus())
    } else {
      setQuery('')
      setResults([])
    }
  }, [showSearch])

  const selectConversation = (id: string) => {
    setActiveConversationId(id)
    setSearchParams({ conversation: id })
    setMobileView('thread')
    setShowSearch(false)
  }

  const backToSidebar = () => {
    setMobileView('sidebar')
  }

  return (
    <div className={`messaging-page mobile-view-${mobileView}`}>
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
        <ConversationHeader
          conversation={activeConversation}
          connected={connected}
          onBack={backToSidebar}
          onToggleSearch={() => setShowSearch((value) => !value)}
          searchActive={showSearch}
        />
        {showSearch && (
          <div className="messaging-search">
            <div className="messaging-search-field">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher dans les messages..."
              />
              {query.length > 0 && (
                <button
                  type="button"
                  className="messaging-search-clear"
                  onClick={() => setQuery('')}
                  aria-label="Effacer la recherche"
                >
                  ×
                </button>
              )}
            </div>
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
            {query.trim().length >= 2 && results.length === 0 && (
              <div className="messaging-search-empty">Aucun résultat</div>
            )}
          </div>
        )}
        <section className="messaging-thread">
          {!activeConversation ? (
            <div className="messaging-empty">
              <div className="messaging-empty-glyph" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h2>Aucune conversation sélectionnée</h2>
              <p>Choisissez un channel ou un message direct pour commencer à discuter.</p>
            </div>
          ) : loading ? (
            <div className="messaging-empty">
              <div className="messaging-spinner" aria-hidden="true" />
              <p>Chargement de la conversation…</p>
            </div>
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
  return <MessagingSurface />
}
