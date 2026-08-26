import type { Project, ProjectDocument, ProjectUpdate, ProjectSection, ProjectItem } from '../../../types/project.types'
import type { BillingDocument } from '../../../types/client.types'
import type { AdminUser } from '../../../types/crm.types'

export interface ProjectFormState {
  name: string
  description: string
  status: string
  projectNumber: string
  startDate: string
  endDate: string
  deliveredAt: string
  priority: string
  responsible: string
  assignedTo: string
  summary: string
  internalNotes: string
  serviceTypes: string[]
  deliverableTypes: string[]
  deadlines: { label: string; dueAt: string }[]
  budget: { amount: number | ''; currency: string; note: string }
  tags: string[]
  billing: { amountInvoiced: number | ''; billingStatus: string; quoteReference: string }
  reminderAt: string
  isArchived: boolean
}

export interface ProjectDetailsTabProps {
  project: Project | null
  form: ProjectFormState
  setForm: React.Dispatch<React.SetStateAction<ProjectFormState>>
  admins: AdminUser[]
  billingDocuments: BillingDocument[]
  canEditProjects: boolean
  canManageBilling: boolean
  canViewBilling: boolean
  serviceTypeInput: string
  setServiceTypeInput: React.Dispatch<React.SetStateAction<string>>
  deliverableTypeInput: string
  setDeliverableTypeInput: React.Dispatch<React.SetStateAction<string>>
  tagInput: string
  setTagInput: React.Dispatch<React.SetStateAction<string>>
  setError: (error: string) => void
  onSave: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  onAddServiceType: () => void
  onRemoveServiceType: (index: number) => void
  onAddDeliverableType: () => void
  onRemoveDeliverableType: (index: number) => void
  onAddDeadline: () => void
  onUpdateDeadline: (index: number, field: string, value: string) => void
  onRemoveDeadline: (index: number) => void
  onAddTag: () => void
  onRemoveTag: (index: number) => void
  onCreateQuote: () => Promise<void>
  onCreateInvoice: () => Promise<void>
  onGeneratePdf: (docId: string) => Promise<void>
  onMarkSent: (docId: string) => Promise<void>
  onMarkPaid: (docId: string) => Promise<void>
}

export interface ProjectContentTabProps {
  projectId: string
  sections: ProjectSection[]
  items: ProjectItem[]
  sectionForm: { title: string; description: string; isVisible: boolean }
  setSectionForm: React.Dispatch<React.SetStateAction<{ title: string; description: string; isVisible: boolean }>>
  itemForm: Record<string, string | boolean>
  setItemForm: React.Dispatch<React.SetStateAction<Record<string, string | boolean>>>
  selectedFile: File | null
  setSelectedFile: React.Dispatch<React.SetStateAction<File | null>>
  canEditContent: boolean
  canViewContent: boolean
  onAddSection: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  onDeleteSection: (sectionId: string) => Promise<void>
  onToggleSectionVisibility: (section: ProjectSection) => Promise<void>
  onAddItem: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  onDeleteItem: (itemId: string) => Promise<void>
  onToggleItemVisibility: (item: ProjectItem) => Promise<void>
  onDownloadItem: (itemId: string, fileName: string) => Promise<void>
}

export interface ProjectUpdatesTabProps {
  updates: ProjectUpdate[]
  updateForm: { title: string; description: string }
  setUpdateForm: React.Dispatch<React.SetStateAction<{ title: string; description: string }>>
  canEditProjects: boolean
  onAddUpdate: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
}

export interface ProjectDocumentsTabProps {
  documents: ProjectDocument[]
  canEditProjects: boolean
  onUpload: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  projectId: string
}
