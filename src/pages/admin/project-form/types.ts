import type { AdminUser } from '../../../types/crm.types'
import type { User } from '../../../types/auth.types'
import type { ProjectTemplate } from '../../../types/template.types'

export interface ProjectFormData {
  clientId: string
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

export interface ProjectInfoSectionProps {
  form: ProjectFormData
  setForm: React.Dispatch<React.SetStateAction<ProjectFormData>>
  clients: User[]
}

export interface ProjectDatesSectionProps {
  form: ProjectFormData
  setForm: React.Dispatch<React.SetStateAction<ProjectFormData>>
}

export interface ProjectManagementSectionProps {
  form: ProjectFormData
  setForm: React.Dispatch<React.SetStateAction<ProjectFormData>>
  admins: AdminUser[]
  tagInput: string
  setTagInput: React.Dispatch<React.SetStateAction<string>>
  addTag: () => void
  removeTag: (index: number) => void
}

export interface ProjectTypesSectionProps {
  form: ProjectFormData
  setForm: React.Dispatch<React.SetStateAction<ProjectFormData>>
  serviceTypeInput: string
  setServiceTypeInput: React.Dispatch<React.SetStateAction<string>>
  addServiceType: () => void
  removeServiceType: (index: number) => void
  deliverableTypeInput: string
  setDeliverableTypeInput: React.Dispatch<React.SetStateAction<string>>
  addDeliverableType: () => void
  removeDeliverableType: (index: number) => void
}

export interface ProjectBudgetSectionProps {
  form: ProjectFormData
  setForm: React.Dispatch<React.SetStateAction<ProjectFormData>>
}

export interface TemplateSectionProps {
  templates: ProjectTemplate[]
  applyTemplate: (templateId: string) => void
}
