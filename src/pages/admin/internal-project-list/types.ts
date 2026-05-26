export interface Member {
  _id: string
  name: string
  email: string
  role: string
}

export interface Mission {
  _id: string
  title: string
  description: string
  status: string
  dueDate: string | null
  progress: number
  assignedTo: { _id: string; name: string; email: string }[]
  internalProject: { _id: string; name: string; entity: string }
  participants: {
    _id: string
    user: { _id: string; name: string; email: string }
    progress: number
    status: string
    blocked: boolean
    blockedReason: string
  }[]
  steps: { _id: string; title: string; description: string; done: boolean; waitingReview: boolean; assignedTo?: string }[]
  deliverables: { _id: string; title: string; description: string; done: boolean; assignedTo?: string }[]
  files: { _id: string; originalName: string; mimeType: string; size: number }[]
  createdAt: string
}

export interface Project {
  _id: string
  name: string
  description: string
  entity: string
  poles: string[]
  members: Member[]
  status: string
  priority: string
  startDate: string | null
  endDate: string | null
  tags: string[]
  createdBy: { name: string }
}

export const emptyForm = {
  name: '',
  description: '',
  entity: 'Venio',
  poles: [] as string[],
  members: [] as string[],
  status: 'EN_COURS',
  priority: 'NORMALE',
  startDate: '',
  endDate: '',
  tags: '',
}
