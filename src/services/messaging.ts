import { apiFetch, getToken } from '../lib/api'
import type { InternalConversation, InternalMessage, MessagingSearchResult, MessagingUser } from '../types/messaging.types'

export async function fetchMessagingUsers(): Promise<MessagingUser[]> {
  const res = await apiFetch<{ users: MessagingUser[] }>('/api/admin/messaging/users')
  return res.users
}

export async function fetchConversations(): Promise<InternalConversation[]> {
  const res = await apiFetch<{ conversations: InternalConversation[] }>('/api/admin/messaging/conversations')
  return res.conversations
}

export async function createChannel(payload: { name: string; visibility: 'PUBLIC' | 'PRIVATE'; participantIds?: string[] }) {
  const res = await apiFetch<{ conversation: InternalConversation }>('/api/admin/messaging/conversations', {
    method: 'POST',
    body: JSON.stringify({ type: 'CHANNEL', ...payload }),
  })
  return res.conversation
}

export async function openDirectConversation(participantId: string) {
  const res = await apiFetch<{ conversation: InternalConversation }>('/api/admin/messaging/direct', {
    method: 'POST',
    body: JSON.stringify({ participantId }),
  })
  return res.conversation
}

export async function fetchMessages(conversationId: string, before?: string): Promise<InternalMessage[]> {
  const query = before ? `?before=${encodeURIComponent(before)}` : ''
  const res = await apiFetch<{ messages: InternalMessage[] }>(`/api/admin/messaging/conversations/${conversationId}/messages${query}`)
  return res.messages
}

export async function sendMessage(conversationId: string, content: string, parentMessage?: string | null) {
  const res = await apiFetch<{ message: InternalMessage }>(`/api/admin/messaging/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, parentMessage: parentMessage || null }),
  })
  return res.message
}

export async function uploadMessageAttachments(conversationId: string, content: string, files: File[]) {
  const token = getToken()
  const form = new FormData()
  form.append('content', content)
  files.forEach((file) => form.append('files', file))
  const response = await fetch(`/api/admin/messaging/conversations/${conversationId}/attachments`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error || 'Envoi impossible')
  return data.message as InternalMessage
}

export async function markConversationRead(conversationId: string) {
  await apiFetch(`/api/admin/messaging/conversations/${conversationId}/read`, { method: 'POST' })
}

export async function searchMessages(query: string): Promise<MessagingSearchResult[]> {
  const res = await apiFetch<{ results: MessagingSearchResult[] }>(`/api/admin/messaging/search?q=${encodeURIComponent(query)}`)
  return res.results
}

export async function editMessage(messageId: string, content: string) {
  const res = await apiFetch<{ message: InternalMessage }>(`/api/admin/messaging/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  })
  return res.message
}

export async function deleteMessage(messageId: string) {
  const res = await apiFetch<{ message: InternalMessage }>(`/api/admin/messaging/messages/${messageId}`, {
    method: 'DELETE',
  })
  return res.message
}

export async function toggleReaction(messageId: string, emoji: string) {
  const res = await apiFetch<{ message: InternalMessage }>(`/api/admin/messaging/messages/${messageId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  })
  return res.message
}
