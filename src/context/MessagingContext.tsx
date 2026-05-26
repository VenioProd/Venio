import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { getToken } from '../lib/api'
import {
  fetchConversations as fetchConversationsApi,
  fetchMessages as fetchMessagesApi,
  markConversationRead as markConversationReadApi,
  sendMessage as sendMessageApi,
} from '../services/messaging'
import type { InternalConversation, InternalMessage } from '../types/messaging.types'

interface MessagingContextValue {
  conversations: InternalConversation[]
  activeConversationId: string | null
  messages: InternalMessage[]
  loading: boolean
  connected: boolean
  typingUsers: Record<string, string>
  setActiveConversationId: (id: string | null) => void
  refreshConversations: () => Promise<void>
  loadMessages: (conversationId: string) => Promise<void>
  sendMessage: (content: string, parentMessage?: string | null) => Promise<void>
  markRead: (conversationId: string) => Promise<void>
  emitTyping: (isTyping: boolean) => void
  replaceMessage: (message: InternalMessage) => void
}

const MessagingContext = createContext<MessagingContextValue | null>(null)

function mergeMessage(list: InternalMessage[], message: InternalMessage): InternalMessage[] {
  const index = list.findIndex((item) => item._id === message._id)
  if (index === -1) return [...list, message]
  const next = [...list]
  next[index] = message
  return next
}

export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<InternalConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<InternalMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({})
  const socketRef = useRef<Socket | null>(null)
  const activeConversationIdRef = useRef<string | null>(null)

  // Track activeConversationId in a ref so socket handlers (created once) can
  // read the latest value without depending on it.
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  const refreshConversations = useCallback(async () => {
    const data = await fetchConversationsApi()
    setConversations(data)
    setActiveConversationId((current) => current || data[0]?._id || null)
  }, [])

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoading(true)
    try {
      const data = await fetchMessagesApi(conversationId)
      setMessages(data)
      socketRef.current?.emit('conversation:join', { conversationId })
    } finally {
      setLoading(false)
    }
  }, [])

  const markRead = useCallback(async (conversationId: string) => {
    await markConversationReadApi(conversationId)
    socketRef.current?.emit('message:read', { conversationId })
    setConversations((prev) => prev.map((conversation) => (
      conversation._id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
    )))
  }, [])

  useEffect(() => {
    refreshConversations().finally(() => setLoading(false))
  }, [refreshConversations])

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      return
    }
    loadMessages(activeConversationId).then(() => markRead(activeConversationId)).catch(() => {})
  }, [activeConversationId, loadMessages, markRead])

  // Create the socket once per token; do NOT recreate when activeConversationId
  // changes (that caused full reconnects on every tab switch).
  useEffect(() => {
    const token = getToken()
    if (!token) return
    const socket = io('/', {
      auth: { token },
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('message:created', ({ message }: { message: InternalMessage }) => {
      const activeId = activeConversationIdRef.current
      setConversations((prev) => prev.map((conversation) => (
        conversation._id === message.conversation
          ? {
              ...conversation,
              lastMessage: message,
              lastMessageAt: message.createdAt,
              unreadCount: message.conversation === activeId ? 0 : conversation.unreadCount + 1,
            }
          : conversation
      )))
      if (message.conversation === activeId) {
        setMessages((prev) => mergeMessage(prev, message))
        markConversationReadApi(message.conversation).catch(() => {})
      }
    })
    socket.on('typing:start', ({ conversationId, userId, name }: { conversationId: string; userId: string; name: string }) => {
      if (conversationId !== activeConversationIdRef.current) return
      setTypingUsers((prev) => ({ ...prev, [userId]: name }))
    })
    socket.on('typing:stop', ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      if (conversationId !== activeConversationIdRef.current) return
      setTypingUsers((prev) => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Emit join/leave on the existing socket when the active conversation changes.
  useEffect(() => {
    const socket = socketRef.current
    if (!socket || !activeConversationId) return
    socket.emit('conversation:join', { conversationId: activeConversationId })
    return () => {
      socket.emit('conversation:leave', { conversationId: activeConversationId })
    }
  }, [activeConversationId])

  const sendMessage = useCallback(async (content: string, parentMessage?: string | null) => {
    if (!activeConversationId) return
    const socket = socketRef.current
    if (socket?.connected) {
      await new Promise<void>((resolve, reject) => {
        socket.emit('message:new', { conversationId: activeConversationId, content, parentMessage }, (ack: { ok: boolean; error?: string }) => {
          if (ack.ok) resolve()
          else reject(new Error(ack.error || 'Envoi impossible'))
        })
      })
      return
    }
    const message = await sendMessageApi(activeConversationId, content, parentMessage)
    setMessages((prev) => mergeMessage(prev, message))
    await refreshConversations()
  }, [activeConversationId, refreshConversations])

  const emitTyping = useCallback((isTyping: boolean) => {
    if (!activeConversationId) return
    socketRef.current?.emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId: activeConversationId })
  }, [activeConversationId])

  const replaceMessage = useCallback((message: InternalMessage) => {
    setMessages((prev) => mergeMessage(prev, message))
  }, [])

  const value = useMemo(() => ({
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
    markRead,
    emitTyping,
    replaceMessage,
  }), [conversations, activeConversationId, messages, loading, connected, typingUsers, refreshConversations, loadMessages, sendMessage, markRead, emitTyping, replaceMessage])

  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>
}

export function useMessaging() {
  const ctx = useContext(MessagingContext)
  if (!ctx) throw new Error('useMessaging must be used within MessagingProvider')
  return ctx
}
