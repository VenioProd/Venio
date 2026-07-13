import type { Document, Types } from 'mongoose'
import type {
  ProjectStatus,
  ProjectPriority,
  BillingStatus,
  ItemType,
  ItemStatus,
  ProjectMemberRole,
} from '../enums.js'

// ─── Project ───
export interface IProjectDeadline {
  label: string
  dueAt: Date
}

export interface IProjectBudget {
  amount: number | null
  currency: string
  note: string
}

export interface IProjectBilling {
  amountInvoiced: number | null
  billingStatus: BillingStatus
  quoteReference: string
}

export interface IProject extends Document {
  name: string
  description: string
  status: ProjectStatus
  client: Types.ObjectId
  serviceTypes: string[]
  deliverableTypes: string[]
  deadlines: IProjectDeadline[]
  budget: IProjectBudget
  startDate: Date | null
  endDate: Date | null
  deliveredAt: Date | null
  projectNumber: string
  priority: ProjectPriority
  responsible: string
  assignedTo: Types.ObjectId | null
  internalNotes: string
  isArchived: boolean
  tags: string[]
  summary: string
  reminderAt: Date | null
  billing: IProjectBilling
  createdAt: Date
  updatedAt: Date
}

// ─── Project collaboration ───
export interface IProjectMember extends Document {
  project: Types.ObjectId
  user: Types.ObjectId
  role: ProjectMemberRole
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export interface IProjectInvitation extends Document {
  project: Types.ObjectId
  tokenHash: string
  role: ProjectMemberRole
  createdBy: Types.ObjectId
  expiresAt: Date
  revokedAt: Date | null
  revokedBy: Types.ObjectId | null
  usedAt: Date | null
  usedBy: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

// ─── ProjectSection ───
export interface IProjectSection extends Document {
  project: Types.ObjectId
  title: string
  description: string
  order: number
  isVisible: boolean
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

// ─── ProjectItem ───
export interface IProjectItemFile {
  originalName: string
  storagePath: string
  mimeType: string
  size: number
}

export interface IProjectItem extends Document {
  project: Types.ObjectId
  section: Types.ObjectId | null
  type: ItemType
  title: string
  description: string
  file: IProjectItemFile
  url: string
  content: string
  order: number
  isVisible: boolean
  isDownloadable: boolean
  status: ItemStatus
  createdBy: Types.ObjectId
  viewedAt: Date | null
  downloadedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// ─── ProjectTemplate ───
export interface ITemplateSection {
  title: string
  description: string
}

export interface ITemplateTask {
  title: string
  description: string
  priority: ProjectPriority
}

export interface ITemplateBudget {
  amount: number | null
  currency: string
}

export interface IProjectTemplate extends Document {
  name: string
  description: string
  serviceTypes: string[]
  deliverableTypes: string[]
  tags: string[]
  priority: ProjectPriority
  defaultSections: ITemplateSection[]
  defaultTasks: ITemplateTask[]
  budget: ITemplateBudget
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

// ─── ProjectUpdate ───
export interface IProjectUpdate extends Document {
  project: Types.ObjectId
  title: string
  description: string
  createdBy: Types.ObjectId
  createdAt: Date
}
