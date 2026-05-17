export type InternalConversationType = 'CHANNEL' | 'DM' | 'GROUP'
export type InternalConversationVisibility = 'PUBLIC' | 'PRIVATE'
export type InternalConversationRole = 'OWNER' | 'MEMBER'

export interface MessagingUser {
  _id: string
  name: string
  email: string
  role: string
}

export interface InternalMessageAttachment {
  originalName: string
  storagePath: string
  mimeType: string
  size: number
}

export interface InternalMessageReaction {
  emoji: string
  users: string[]
}

export interface InternalMessage {
  _id: string
  conversation: string
  sender: MessagingUser
  content: string
  mentions: MessagingUser[]
  attachments: InternalMessageAttachment[]
  parentMessage: string | null
  reactions: InternalMessageReaction[]
  editedAt: string | null
  deletedAt: string | null
  deletedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface InternalConversation {
  _id: string
  type: InternalConversationType
  name: string
  slug: string | null
  visibility: InternalConversationVisibility
  memberKey: string
  createdBy: string
  isArchived: boolean
  lastMessageAt: string | null
  membership: {
    role: InternalConversationRole
    muted: boolean
    lastReadAt: string | null
  } | null
  unreadCount: number
  lastMessage: InternalMessage | null
  createdAt: string
  updatedAt: string
}

export interface MessagingSearchResult extends InternalMessage {
  conversation: string
}
