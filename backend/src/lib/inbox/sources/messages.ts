import InternalConversation from '../../../models/InternalConversation.js'
import InternalConversationMember from '../../../models/InternalConversationMember.js'
import type { InboxItem, InboxTag } from '../types.js'
import { scoreUrgency } from '../scoreUrgency.js'

const TAG: InboxTag = { label: 'MSG', color: '#8b5cf6' }

export async function getMessageItems(userId: string): Promise<InboxItem[]> {
  // Get all conversations the user is a member of, with lastReadAt
  const memberships = await InternalConversationMember.find({ user: userId })
    .select('conversation lastReadAt')
    .lean()
  if (memberships.length === 0) return []

  const conversationIds = memberships.map((m: any) => m.conversation)
  const conversations = await InternalConversation.find({
    _id: { $in: conversationIds },
    isArchived: false,
    lastMessageAt: { $ne: null },
  })
    .select('_id type name lastMessageAt')
    .lean()

  const lastReadMap = new Map(memberships.map((m: any) => [String(m.conversation), m.lastReadAt]))
  const unread = conversations.filter((c: any) => {
    const lastRead = lastReadMap.get(String(c._id))
    return !lastRead || (c.lastMessageAt && c.lastMessageAt > lastRead)
  })

  return unread.map((c: any) => ({
    id: `message:${c._id}`,
    type: 'message' as const,
    sourceId: String(c._id),
    title: c.type === 'DM'
      ? `DM ${c.name ?? '(sans nom)'}`
      : `#${c.name ?? 'canal'} (non lus)`,
    meta: [
      c.lastMessageAt ? `dernier msg ${new Date(c.lastMessageAt).toLocaleDateString('fr-FR')}` : '',
    ].filter(Boolean),
    urgency: scoreUrgency({ type: 'message' }),
    tag: TAG,
    actions: [{ kind: 'read' as const, label: 'Lire ⏎', shortcut: 'enter' }],
    link: '/admin/messages',
  }))
}
