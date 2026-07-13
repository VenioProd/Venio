export type ProjectStatus = 'EN_COURS' | 'EN_ATTENTE' | 'TERMINE'
export type ProjectPriority = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
export type ItemType =
  | 'LIVRABLE'
  | 'DEVIS'
  | 'FACTURE'
  | 'CONTRAT'
  | 'CAHIER_DES_CHARGES'
  | 'MAQUETTE'
  | 'DOCUMENTATION'
  | 'LIEN'
  | 'NOTE'
  | 'AUTRE'
export type ItemStatus = 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'VALIDE'
export type DocumentType = 'DEVIS' | 'FACTURE' | 'FICHIER_PROJET'
export type BillingStatus = 'NON_FACTURE' | 'PARTIEL' | 'FACTURE'
export type ProjectAccessRole = 'OWNER' | 'EDITOR' | 'VIEWER'
export type ProjectCollaboratorRole = 'EDITOR' | 'VIEWER'

export interface ProjectCollaborator {
  _id: string
  user: {
    _id: string
    name: string
    email: string
    avatarUrl?: string
  }
  role: ProjectCollaboratorRole
  createdAt: string
}

export interface Project {
  _id: string
  name: string
  description?: string
  status: string
  progressPercent?: number
  projectNumber?: string
  startDate?: string
  endDate?: string
  deliveredAt?: string
  priority?: string
  responsible?: string
  assignedTo?: { _id: string; name: string; email: string } | null
  summary?: string
  internalNotes?: string
  serviceTypes?: string[]
  deliverableTypes?: string[]
  deadlines?: Deadline[]
  budget?: ProjectBudget
  tags?: string[]
  billing?: ProjectBilling
  reminderAt?: string
  isArchived?: boolean
  client?: { name: string; _id?: string }
  createdAt?: string
  updatedAt?: string
}

export interface Deadline {
  label: string
  dueAt: string
}

export interface ProjectBudget {
  amount: number | '' | null
  currency: string
  note?: string
}

export interface ProjectBilling {
  amountInvoiced: number | '' | null
  billingStatus: string
  quoteReference?: string
}

export interface ProjectUpdate {
  _id: string
  title: string
  description: string
  createdAt: string
}

export interface ProjectSection {
  _id: string
  title: string
  description?: string
  isVisible: boolean
}

export interface ProjectItem {
  _id: string
  type: string
  title: string
  description?: string
  url?: string
  content?: string
  isVisible: boolean
  isDownloadable: boolean
  status?: string
  section?: { _id: string } | string
  file?: { originalName: string; path?: string; mimeType?: string; size?: number }
}

export interface ProjectDocument {
  _id: string
  type: string
  originalName: string
}
