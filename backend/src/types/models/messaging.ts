import type { Document, Types } from 'mongoose'
import type {
  InternalConversationRole,
  InternalConversationType,
  InternalConversationVisibility,
} from '../enums.js'

export interface IInternalConversation extends Document {
  type: InternalConversationType
  name: string
  slug: string | null
  visibility: InternalConversationVisibility
  memberKey: string
  createdBy: Types.ObjectId
  isArchived: boolean
  lastMessageAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface IInternalConversationMember extends Document {
  conversation: Types.ObjectId
  user: Types.ObjectId
  role: InternalConversationRole
  muted: boolean
  lastReadAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface IInternalMessageAttachment {
  originalName: string
  storagePath: string
  mimeType: string
  size: number
}

export interface IInternalMessageReaction {
  emoji: string
  users: Types.ObjectId[]
}

export interface IInternalMessage extends Document {
  conversation: Types.ObjectId
  sender: Types.ObjectId
  content: string
  mentions: Types.ObjectId[]
  attachments: IInternalMessageAttachment[]
  parentMessage: Types.ObjectId | null
  reactions: IInternalMessageReaction[]
  editedAt: Date | null
  deletedAt: Date | null
  deletedBy: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}
