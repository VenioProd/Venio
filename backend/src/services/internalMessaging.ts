import mongoose from 'mongoose'
import InternalConversation from '../models/InternalConversation.js'
import InternalConversationMember from '../models/InternalConversationMember.js'
import InternalMessage from '../models/InternalMessage.js'
import Notification from '../models/Notification.js'
import User from '../models/User.js'
import { sendPushToUser } from '../lib/webPush.js'
import { shouldNotify } from '../lib/notificationPreferences.js'
import { isInternalRole } from '../lib/permissions.js'
import type { JwtPayload } from '../types/express.js'
import type { IInternalMessageAttachment } from '../types/models/index.js'

export const MAX_MESSAGE_LENGTH = 4000

export function normalizeConversationSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function extractMentionIds(content: string): string[] {
  const ids = new Set<string>()
  const mentionPattern = /@(?:\[[^\]]+])?\(([a-f0-9]{24})\)/gi
  let match = mentionPattern.exec(content)
  while (match) {
    ids.add(match[1])
    match = mentionPattern.exec(content)
  }
  return Array.from(ids)
}

export function assertInternalUser(user: JwtPayload): void {
  if (!isInternalRole(user.role)) {
    const err = new Error('Forbidden')
    ;(err as Error & { status?: number }).status = 403
    throw err
  }
}

function toObjectId(id: string) {
  return new mongoose.Types.ObjectId(id)
}

function buildMemberKey(userIds: string[]): string {
  return Array.from(new Set(userIds.map(String))).sort().join(':')
}

export async function canAccessConversation(conversationId: string, user: JwtPayload): Promise<boolean> {
  assertInternalUser(user)
  const conversation = await InternalConversation.findById(conversationId).select('visibility isArchived')
  if (!conversation || conversation.isArchived) return false
  if (conversation.visibility === 'PUBLIC') return true

  const member = await InternalConversationMember.exists({
    conversation: conversationId,
    user: user.id,
  })
  return Boolean(member)
}

export async function ensureMembership(conversationId: string, userId: string) {
  return InternalConversationMember.findOneAndUpdate(
    { conversation: conversationId, user: userId },
    { $setOnInsert: { role: 'MEMBER' } },
    { new: true, upsert: true }
  )
}

export async function ensureGeneralChannel(user: JwtPayload) {
  assertInternalUser(user)
  const slug = 'general'
  let conversation = await InternalConversation.findOne({ slug })
  if (!conversation) {
    conversation = await InternalConversation.create({
      type: 'CHANNEL',
      name: 'Général',
      slug,
      visibility: 'PUBLIC',
      createdBy: user.id,
    })
  }
  await ensureMembership(conversation._id.toString(), user.id)
  return conversation
}

export async function listConversations(user: JwtPayload) {
  assertInternalUser(user)
  await ensureGeneralChannel(user)

  const memberships = await InternalConversationMember.find({ user: user.id }).select('conversation lastReadAt muted role')
  const memberConversationIds = memberships.map((member) => member.conversation)
  const membershipByConversation = new Map(memberships.map((member) => [member.conversation.toString(), member]))

  const conversations = await InternalConversation.find({
    isArchived: false,
    $or: [
      { visibility: 'PUBLIC' },
      { _id: { $in: memberConversationIds } },
    ],
  })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .lean()

  const lastMessages = await InternalMessage.find({
    conversation: { $in: conversations.map((conversation) => conversation._id) },
    parentMessage: null,
  })
    .sort({ createdAt: -1 })
    .populate('sender', 'name email role')
    .lean()

  const lastMessageByConversation = new Map<string, unknown>()
  for (const message of lastMessages) {
    const conversationId = message.conversation.toString()
    if (!lastMessageByConversation.has(conversationId)) {
      lastMessageByConversation.set(conversationId, message)
    }
  }

  const unreadCounts = await Promise.all(conversations.map(async (conversation) => {
    const membership = membershipByConversation.get(conversation._id.toString())
    const query: Record<string, unknown> = {
      conversation: conversation._id,
      sender: { $ne: toObjectId(user.id) },
      deletedAt: null,
    }
    if (membership?.lastReadAt) {
      query.createdAt = { $gt: membership.lastReadAt }
    } else if (!membership) {
      return [conversation._id.toString(), 0] as const
    }
    return [conversation._id.toString(), await InternalMessage.countDocuments(query)] as const
  }))
  const unreadByConversation = new Map(unreadCounts)

  return conversations.map((conversation) => {
    const membership = membershipByConversation.get(conversation._id.toString())
    return {
      ...conversation,
      membership: membership ? {
        role: membership.role,
        muted: membership.muted,
        lastReadAt: membership.lastReadAt,
      } : null,
      unreadCount: unreadByConversation.get(conversation._id.toString()) || 0,
      lastMessage: lastMessageByConversation.get(conversation._id.toString()) || null,
    }
  })
}

export async function createConversation(user: JwtPayload, input: {
  type: 'CHANNEL' | 'DM' | 'GROUP'
  name?: string
  visibility?: 'PUBLIC' | 'PRIVATE'
  participantIds?: string[]
}) {
  assertInternalUser(user)

  const participantIds = Array.from(new Set([user.id, ...(input.participantIds || [])]))
  if (input.type !== 'CHANNEL' && participantIds.length < 2) {
    throw Object.assign(new Error('Au moins un destinataire est requis'), { status: 400 })
  }

  const activeInternalUsers = await User.find({
    _id: { $in: participantIds },
    role: { $in: ['SUPER_ADMIN', 'ADMIN', 'RH', 'VIEWER', 'STAGIAIRE', 'AGENT'] },
    isActive: { $ne: false },
  }).select('_id name')
  if (activeInternalUsers.length !== participantIds.length) {
    throw Object.assign(new Error('Participant interne invalide'), { status: 400 })
  }

  if (input.type === 'DM') {
    const memberKey = buildMemberKey(participantIds)
    const existing = await InternalConversation.findOne({ type: 'DM', memberKey })
    if (existing) return existing

    const conversation = await InternalConversation.create({
      type: 'DM',
      name: activeInternalUsers
        .filter((participant) => participant._id.toString() !== user.id)
        .map((participant) => participant.name)
        .join(', '),
      visibility: 'PRIVATE',
      memberKey,
      createdBy: user.id,
    })
    await InternalConversationMember.insertMany(participantIds.map((participantId) => ({
      conversation: conversation._id,
      user: participantId,
      role: participantId === user.id ? 'OWNER' : 'MEMBER',
    })))
    return conversation
  }

  const name = (input.name || '').trim()
  if (!name) throw Object.assign(new Error('Le nom de la conversation est requis'), { status: 400 })
  const slug = input.type === 'CHANNEL' ? normalizeConversationSlug(name) : undefined

  const conversation = await InternalConversation.create({
    type: input.type,
    name,
    ...(slug !== undefined && { slug }),
    visibility: input.type === 'CHANNEL' ? input.visibility || 'PUBLIC' : 'PRIVATE',
    memberKey: input.type === 'GROUP' ? buildMemberKey(participantIds) : '',
    createdBy: user.id,
  })
  await InternalConversationMember.insertMany(participantIds.map((participantId) => ({
    conversation: conversation._id,
    user: participantId,
    role: participantId === user.id ? 'OWNER' : 'MEMBER',
  })))
  return conversation
}

export async function listMessages(user: JwtPayload, conversationId: string, options: { before?: string; limit?: number } = {}) {
  if (!(await canAccessConversation(conversationId, user))) {
    throw Object.assign(new Error('Conversation non trouvée'), { status: 404 })
  }
  await ensureMembership(conversationId, user.id)
  const limit = Math.min(Math.max(options.limit || 50, 1), 100)
  const query: Record<string, unknown> = { conversation: conversationId }
  if (options.before) query.createdAt = { $lt: new Date(options.before) }

  return InternalMessage.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sender', 'name email role')
    .populate('mentions', 'name email role')
    .lean()
    .then((messages) => messages.reverse())
}

async function notifyMessageRecipients(user: JwtPayload, conversationId: string, messageId: string, content: string, mentionIds: string[]) {
  const conversation = await InternalConversation.findById(conversationId)
  if (!conversation) return

  const recipients = new Set<string>(mentionIds.filter((id) => id !== user.id))
  if (conversation.type === 'DM' || conversation.type === 'GROUP') {
    const members = await InternalConversationMember.find({ conversation: conversationId, user: { $ne: user.id }, muted: false })
    members.forEach((member) => recipients.add(member.user.toString()))
  }

  if (recipients.size === 0) return

  const title = conversation.type === 'CHANNEL'
    ? `Mention dans #${conversation.slug || conversation.name}`
    : `Nouveau message de ${user.name || 'Venio'}`
  const preview = content.length > 140 ? `${content.slice(0, 137)}...` : content
  const link = `/admin/messages?conversation=${conversationId}&message=${messageId}`

  // Filtrage des destinataires selon les préférences in-app et push
  const recipientList = Array.from(recipients)
  const [inAppAllowed, pushAllowed] = await Promise.all([
    Promise.all(recipientList.map((id) => shouldNotify(id, 'INTERNAL_MESSAGE', 'inApp'))),
    Promise.all(recipientList.map((id) => shouldNotify(id, 'INTERNAL_MESSAGE', 'push'))),
  ])

  const inAppRecipients = recipientList.filter((_, idx) => inAppAllowed[idx])
  if (inAppRecipients.length > 0) {
    await Notification.insertMany(inAppRecipients.map((recipient) => ({
      recipient,
      type: 'INTERNAL_MESSAGE',
      title,
      message: preview,
      link,
      metadata: { conversationId, messageId },
    })), { ordered: false })
  }

  // Push web pour chaque destinataire autorisé (background, ne bloque pas)
  recipientList.forEach((recipient, idx) => {
    if (!pushAllowed[idx]) return
    sendPushToUser(recipient, {
      title,
      body: preview,
      link,
      tag: `conversation:${conversationId}`,
      data: { conversationId, messageId, type: 'INTERNAL_MESSAGE' },
    }).catch(() => {})
  })
}

export async function createMessage(user: JwtPayload, conversationId: string, input: {
  content: string
  parentMessage?: string | null
  attachments?: IInternalMessageAttachment[]
}) {
  assertInternalUser(user)
  if (!(await canAccessConversation(conversationId, user))) {
    throw Object.assign(new Error('Conversation non trouvée'), { status: 404 })
  }

  const content = input.content.trim()
  if (!content) throw Object.assign(new Error('Le contenu du message est requis'), { status: 400 })
  if (content.length > MAX_MESSAGE_LENGTH) throw Object.assign(new Error('Message trop long'), { status: 400 })

  await ensureMembership(conversationId, user.id)
  const mentionIds = extractMentionIds(content)
  const message = await InternalMessage.create({
    conversation: conversationId,
    sender: user.id,
    content,
    mentions: mentionIds,
    parentMessage: input.parentMessage || null,
    attachments: input.attachments || [],
  })
  await InternalConversation.findByIdAndUpdate(conversationId, { lastMessageAt: message.createdAt })
  await markConversationRead(user, conversationId)
  await notifyMessageRecipients(user, conversationId, message._id.toString(), content, mentionIds)

  return message.populate([
    { path: 'sender', select: 'name email role' },
    { path: 'mentions', select: 'name email role' },
  ])
}

export async function markConversationRead(user: JwtPayload, conversationId: string) {
  assertInternalUser(user)
  if (!(await canAccessConversation(conversationId, user))) {
    throw Object.assign(new Error('Conversation non trouvée'), { status: 404 })
  }
  return InternalConversationMember.findOneAndUpdate(
    { conversation: conversationId, user: user.id },
    { $set: { lastReadAt: new Date() }, $setOnInsert: { role: 'MEMBER' } },
    { upsert: true, new: true }
  )
}

export async function searchMessages(user: JwtPayload, query: string) {
  assertInternalUser(user)
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const conversations = await listConversations(user)
  const conversationIds = conversations.map((conversation) => conversation._id)
  return InternalMessage.find({
    conversation: { $in: conversationIds },
    deletedAt: null,
    content: { $regex: trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
  })
    .sort({ createdAt: -1 })
    .limit(30)
    .populate('sender', 'name email role')
    .lean()
}

export async function updateMessage(user: JwtPayload, messageId: string, content: string) {
  const message = await InternalMessage.findById(messageId)
  if (!message || message.sender.toString() !== user.id) {
    throw Object.assign(new Error('Message non trouvé'), { status: 404 })
  }
  if (!(await canAccessConversation(message.conversation.toString(), user))) {
    throw Object.assign(new Error('Message non trouvé'), { status: 404 })
  }
  const nextContent = content.trim()
  if (!nextContent) throw Object.assign(new Error('Le contenu du message est requis'), { status: 400 })
  message.content = nextContent
  message.mentions = extractMentionIds(nextContent).map((id) => toObjectId(id))
  message.editedAt = new Date()
  await message.save()
  return message.populate('sender', 'name email role')
}

export async function softDeleteMessage(user: JwtPayload, messageId: string) {
  const message = await InternalMessage.findById(messageId)
  if (!message || message.sender.toString() !== user.id) {
    throw Object.assign(new Error('Message non trouvé'), { status: 404 })
  }
  if (!(await canAccessConversation(message.conversation.toString(), user))) {
    throw Object.assign(new Error('Message non trouvé'), { status: 404 })
  }
  message.deletedAt = new Date()
  message.deletedBy = toObjectId(user.id)
  message.content = 'Message supprimé'
  await message.save()
  return message.populate('sender', 'name email role')
}

export async function toggleReaction(user: JwtPayload, messageId: string, emoji: string) {
  const message = await InternalMessage.findById(messageId)
  if (!message || !(await canAccessConversation(message.conversation.toString(), user))) {
    throw Object.assign(new Error('Message non trouvé'), { status: 404 })
  }
  const normalizedEmoji = emoji.trim().slice(0, 16)
  if (!normalizedEmoji) throw Object.assign(new Error('Réaction invalide'), { status: 400 })
  const existing = message.reactions.find((reaction) => reaction.emoji === normalizedEmoji)
  const userObjectId = toObjectId(user.id)
  if (!existing) {
    message.reactions.push({ emoji: normalizedEmoji, users: [userObjectId] })
  } else if (existing.users.some((id) => id.toString() === user.id)) {
    existing.users = existing.users.filter((id) => id.toString() !== user.id)
    if (existing.users.length === 0) {
      message.reactions = message.reactions.filter((reaction) => reaction.emoji !== normalizedEmoji)
    }
  } else {
    existing.users.push(userObjectId)
  }
  await message.save()
  return message.populate('sender', 'name email role')
}
