import { describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import InternalConversation from '../models/InternalConversation.js'
import InternalConversationMember from '../models/InternalConversationMember.js'
import InternalMessage from '../models/InternalMessage.js'
import { extractMentionIds, normalizeConversationSlug } from '../services/internalMessaging.js'

describe('internal messaging models', () => {
  it('validates a channel conversation with a slug and creator', () => {
    const conversation = new InternalConversation({
      type: 'CHANNEL',
      name: 'General',
      slug: 'general',
      visibility: 'PUBLIC',
      createdBy: new mongoose.Types.ObjectId(),
    })

    expect(conversation.validateSync()).toBeUndefined()
  })

  it('rejects a channel conversation without a slug', () => {
    const conversation = new InternalConversation({
      type: 'CHANNEL',
      name: 'General',
      visibility: 'PUBLIC',
      createdBy: new mongoose.Types.ObjectId(),
    })

    const errors = conversation.validateSync()

    expect(errors).toBeDefined()
    expect(errors!.errors.slug).toBeDefined()
  })

  it('validates membership read state', () => {
    const member = new InternalConversationMember({
      conversation: new mongoose.Types.ObjectId(),
      user: new mongoose.Types.ObjectId(),
      role: 'MEMBER',
      lastReadAt: new Date('2026-05-17T09:00:00.000Z'),
    })

    expect(member.validateSync()).toBeUndefined()
  })

  it('validates messages with mentions and attachments metadata', () => {
    const message = new InternalMessage({
      conversation: new mongoose.Types.ObjectId(),
      sender: new mongoose.Types.ObjectId(),
      content: 'Hello @Marie, voici le brief.',
      mentions: [new mongoose.Types.ObjectId()],
      attachments: [
        {
          originalName: 'brief.pdf',
          storagePath: 'internal-messaging/brief.pdf',
          mimeType: 'application/pdf',
          size: 42_000,
        },
      ],
    })

    expect(message.validateSync()).toBeUndefined()
  })
})

describe('internal messaging helpers', () => {
  it('normalizes channel names into stable slugs', () => {
    expect(normalizeConversationSlug('  Canal Général / Projet Venio  ')).toBe('canal-general-projet-venio')
  })

  it('extracts unique user ids from mention tokens', () => {
    const userId = new mongoose.Types.ObjectId().toString()
    const otherUserId = new mongoose.Types.ObjectId().toString()

    expect(extractMentionIds(`Salut @[Marie](${userId}) et @[Hugo](${otherUserId}) puis @[Marie](${userId})`)).toEqual([
      userId,
      otherUserId,
    ])
  })
})
