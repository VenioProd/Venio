export type TaskStatus = 'A_FAIRE' | 'EN_COURS' | 'EN_REVIEW' | 'TERMINE' | 'VALIDE' | 'NON_VALIDE' | 'A_MODIFIER'
export type TaskPriority = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'

export interface TaskAttachment {
  _id: string
  originalName: string
  mimeType: string
  size: number
  uploadedBy: { _id: string; name: string } | string
  uploadedAt: string
}

export interface Task {
  _id: string
  project: string | { _id: string; name: string }
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assignee: { _id: string; name: string; email: string } | null
  dueDate: string | null
  startDate: string | null
  estimatedDuration: number | null
  progress: number
  tags: string[]
  order: number
  createdBy: { _id: string; name: string; email: string }
  attachments?: TaskAttachment[]
  createdAt: string
  updatedAt: string
}

export interface TaskFormData {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assignee: string
  dueDate: string
  startDate: string
  estimatedDuration: number | null
  progress: number
  tags: string[]
}

export interface TaskComment {
  _id: string
  task: string
  author: { _id: string; name: string; email: string }
  content: string
  mentions: { _id: string; name: string; email: string }[]
  createdAt: string
  updatedAt: string
}
