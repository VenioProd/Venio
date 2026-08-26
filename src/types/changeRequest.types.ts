export type ChangeRequestStatus = 'SOUMISE' | 'A_CHIFFRER' | 'PLANIFIEE' | 'EN_COURS' | 'LIVREE' | 'VALIDEE' | 'REFUSEE'

export type ChangeRequestPriority = 'BASSE' | 'NORMALE' | 'HAUTE'
export type ChangeRequestQualification = 'INCLUSE' | 'A_CHIFFRER' | null

export interface ChangeRequestFile {
  filename: string
  originalName: string
  mimetype: string
  size: number
}

export interface ChangeRequestReply {
  _id: string
  authorId: string
  authorName: string
  authorAvatarUrl?: string
  message: string
  attachments?: ChangeRequestFile[]
  createdAt: string
}

export interface ChangeRequestStatusEntry {
  status: ChangeRequestStatus
  at: string
  byUserId: string
  byName: string
  note: string
}

/** Devis lié, exposé au client seulement quand il est consultable. */
export interface LinkedProposal {
  proposalId: string
  projectId: string
  status: 'SENT' | 'SIGNED' | 'EXPIRED'
  title: string
}

interface ChangeRequestBase {
  _id: string
  title: string
  description: string
  pageUrl: string
  priority: ChangeRequestPriority
  status: ChangeRequestStatus
  qualification: ChangeRequestQualification
  refusalReason: string
  createdByName: string
  attachments?: ChangeRequestFile[]
  replies: ChangeRequestReply[]
  statusHistory: ChangeRequestStatusEntry[]
  deliveredAt: string | null
  validatedAt: string | null
  createdAt: string
  updatedAt: string
  replyCount?: number
}

export interface ClientChangeRequest extends ChangeRequestBase {
  client: string
  createdBy: string
  project: { _id: string; name: string } | null
  linkedProposal?: LinkedProposal | null
}

export interface AdminChangeRequest extends ChangeRequestBase {
  client: { _id: string; name: string; companyName?: string; avatarUrl?: string; email?: string }
  createdBy: string
  project: { _id: string; name: string } | null
  quoteProposal: { _id: string; status: string; title: string; expiresAt: string | null } | null
}

export interface ChangeRequestStats {
  aTraiter: number
  enCours: number
}

export interface NewChangeRequestInput {
  title: string
  description: string
  pageUrl?: string
  projectId?: string
  priority?: ChangeRequestPriority
  files?: File[]
}
