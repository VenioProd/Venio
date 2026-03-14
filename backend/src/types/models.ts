import type { Document, Types } from 'mongoose'
import type {
  UserRole, UserSource, ClientStatus, OnboardingStatus, HealthStatus,
  ProjectStatus, ProjectPriority, BillingStatus,
  TaskStatus, TaskPriority,
  CrmStatus, LeadTemperature,
  ItemType, ItemStatus, DocumentType,
  BillingDocumentType, BillingDocumentStatus,
  ActivityAction, AuditAction, NotificationType,
  NoteVisibility, EscalationAction, QualiopiStatus,
  BriefEntity, BriefPriority, BriefStatus,
} from './enums.js'

// ─── User ───
export interface IUserAddress {
  line1: string
  line2: string
  city: string
  postalCode: string
  country: string
}

export interface IUser extends Document {
  email: string
  passwordHash: string
  role: UserRole
  name: string
  companyName: string
  serviceType: string
  phone: string
  website: string
  address: IUserAddress
  tags: string[]
  source: UserSource
  ownerAdminId: Types.ObjectId | null
  status: ClientStatus
  onboardingStatus: OnboardingStatus
  healthStatus: HealthStatus
  lastContactAt: Date | null
  archivedAt: Date | null
  twoFactorSecret: string | null
  twoFactorEnabled: boolean
  customPermissions: string[] | null
  createdAt: Date
  updatedAt: Date
}

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

// ─── Task ───
export interface ITaskAttachment {
  _id: Types.ObjectId
  originalName: string
  storagePath: string
  mimeType: string
  size: number
  uploadedBy: Types.ObjectId
  uploadedAt: Date
}

export interface ITask extends Document {
  project: Types.ObjectId
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assignee: Types.ObjectId | null
  dueDate: Date | null
  startDate: Date | null
  estimatedDuration: number | null
  progress: number
  tags: string[]
  order: number
  createdBy: Types.ObjectId
  attachments: ITaskAttachment[]
  createdAt: Date
  updatedAt: Date
}

// ─── Lead ───
export interface ILead extends Document {
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string
  source: string
  status: CrmStatus
  priority: ProjectPriority
  budget: number | null
  nextActionAt: Date | null
  lastContactAt: Date | null
  notes: string
  serviceType: string
  leadTemperature: LeadTemperature
  interactionNotes: string
  assignedTo: Types.ObjectId | null
  createdBy: Types.ObjectId
  statusChangedAt: Date | null
  clientAccountId: Types.ObjectId | null
  score: number | null
  createdAt: Date
  updatedAt: Date
}

// ─── Sequence ───
export interface ISequence extends Document {
  name: string
  value: number
  prefix: string
  suffix: string
  padding: number
}

// ─── ActivityLog ───
export interface IActivityLog extends Document {
  project: Types.ObjectId
  action: ActivityAction
  actor: Types.ObjectId
  summary: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

// ─── AuditLog ───
export interface IAuditLog extends Document {
  userId: Types.ObjectId | null
  email: string
  action: AuditAction
  ip: string
  userAgent: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

// ─── BillingDocument ───
export interface IBillingLine {
  _id?: Types.ObjectId
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
  total: number
}

export interface IBillingDocument extends Document {
  type: BillingDocumentType
  number: string
  project: Types.ObjectId
  client: Types.ObjectId
  status: BillingDocumentStatus
  issuedAt: Date | null
  dueAt: Date | null
  sentAt: Date | null
  paidAt: Date | null
  lines: IBillingLine[]
  subtotal: number
  taxTotal: number
  total: number
  currency: string
  note: string
  pdfStoragePath: string | null
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

// ─── ClientActivity ───
export interface IClientActivity extends Document {
  clientId: Types.ObjectId
  type: string
  label: string
  payload: Record<string, unknown>
  actorId: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

// ─── ClientContact ───
export interface IClientContact extends Document {
  clientId: Types.ObjectId
  firstName: string
  lastName: string
  email: string
  phone: string
  role: string
  isMain: boolean
  notes: string
  createdAt: Date
  updatedAt: Date
}

// ─── ClientNote ───
export interface IClientNote extends Document {
  clientId: Types.ObjectId
  content: string
  createdBy: Types.ObjectId
  visibility: NoteVisibility
  pinned: boolean
  createdAt: Date
  updatedAt: Date
}

// ─── CrmSettings ───
export interface IScoringWeights {
  budgetHigh: number
  budgetMedium: number
  budgetLow: number
  sourceReferral: number
  sourceAds: number
  sourceOther: number
  priorityUrgent: number
  priorityHigh: number
  priorityNormal: number
  hasEmail: number
  hasPhone: number
}

export interface ICrmSettings extends Document {
  roundRobinEnabled: boolean
  autoQualifyEnabled: boolean
  autoLastContactOnContacted: boolean
  autoNextActionOnDemo: boolean
  demoFollowUpDays: number
  autoNextActionOnProposal: boolean
  proposalFollowUpDays: number
  clearNextActionOnClose: boolean
  emailOnAssignment: boolean
  activityLogging: boolean
  coldLeadAlertEnabled: boolean
  coldLeadThresholdDays: number
  coldLeadEmailEnabled: boolean
  overdueAlertEnabled: boolean
  dailyOverdueEmailEnabled: boolean
  dailyOverdueEmailTime: string
  staleLeadAlertEnabled: boolean
  staleLeadThresholdDays: number
  escalationEnabled: boolean
  escalationThresholdDays: number
  escalationAction: EscalationAction
  escalationManagerId: Types.ObjectId | null
  scoringEnabled: boolean
  scoringWeights: IScoringWeights
  duplicateDetectionEnabled: boolean
  duplicateCheckEmail: boolean
  duplicateCheckCompany: boolean
  duplicateCheckPhone: boolean
  proposalReminderEnabled: boolean
  proposalReminderDays: number
  weeklyReportEnabled: boolean
  weeklyReportDay: number
  weeklyReportTime: string
  weeklyReportRecipients: string[]
  createdAt: Date
  updatedAt: Date
}

// ─── Document ───
export interface IDocument extends Document {
  project: Types.ObjectId
  type: DocumentType
  originalName: string
  storagePath: string
  mimeType: string
  uploadedBy: Types.ObjectId
  uploadedAt: Date
  downloadedAt: Date | null
}

// ─── LeadActivity ───
export interface ILeadActivity extends Document {
  leadId: Types.ObjectId
  type: string
  label: string
  payload: Record<string, unknown>
  actorId: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

// ─── Message ───
export interface IMessage extends Document {
  project: Types.ObjectId
  sender: Types.ObjectId
  content: string
  readBy: Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

// ─── Notification ───
export interface INotification extends Document {
  recipient: Types.ObjectId
  type: NotificationType
  title: string
  message: string
  link: string
  isRead: boolean
  metadata: Record<string, unknown>
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

// ─── MissionBrief ───
export interface IBriefDateCle {
  label: string
  date: Date
}

export interface IMissionBrief extends Document {
  project: Types.ObjectId
  task: Types.ObjectId | null
  destinataire: Types.ObjectId
  entity: BriefEntity
  briefPriority: BriefPriority
  deadline: Date
  intitule: string
  contexte: string
  livrablesAttendus: string
  formatLivrable: string[]
  ressources: string
  pointsVigilance: string
  pointIntermediaire: Date | null
  validationPar: Types.ObjectId | null
  statut: BriefStatus
  datesCles: IBriefDateCle[]
  commentaires: string
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

// ─── TaskComment ───
export interface ITaskComment extends Document {
  task: Types.ObjectId
  author: Types.ObjectId
  content: string
  mentions: Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

// ─── Qualiopi ───
export interface IQualiopiSubElement {
  _id?: Types.ObjectId
  title: string
  status: QualiopiStatus
  assignee: Types.ObjectId | null
  dueDate: Date | null
  files: { originalName: string; storagePath: string; mimeType: string; size: number; uploadedAt: Date }[]
  notes: string
  order: number
}

export interface IQualiopiIndicator {
  _id?: Types.ObjectId
  number: number
  title: string
  status: QualiopiStatus
  assignee: Types.ObjectId | null
  startDate: Date | null
  endDate: Date | null
  subElements: IQualiopiSubElement[]
  files: { originalName: string; storagePath: string; mimeType: string; size: number; uploadedAt: Date }[]
  order: number
}

export interface IQualiopiCriterion extends Document {
  number: number
  title: string
  objective: string
  indicators: IQualiopiIndicator[]
  createdAt: Date
  updatedAt: Date
}

/* ── Qualiopi Questionnaires ── */

export interface IQualiopiQuestion {
  type: 'rating' | 'text' | 'multiple_choice'
  label: string
  options: string[]
  required: boolean
  order: number
}

export interface IQualiopiAnswer {
  questionIndex: number
  value: string
}

export interface IQualiopiQuestionnaireResponse {
  _id: Types.ObjectId
  respondentName: string
  respondentEmail: string
  formation: string
  answers: IQualiopiAnswer[]
  submittedAt: Date
}

export interface IQualiopiQuestionnaire extends Document {
  title: string
  description: string
  questions: IQualiopiQuestion[]
  active: boolean
  token: string
  responses: IQualiopiQuestionnaireResponse[]
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}
