// Status color maps pour les missions
export const MSC: Record<string, string> = { A_FAIRE: '#fde047', EN_COURS: '#38bdf8', TERMINE: '#6ee7b7' }
export const MSBg: Record<string, string> = { A_FAIRE: 'rgba(234,179,8,0.12)', EN_COURS: 'rgba(14,165,233,0.12)', TERMINE: 'rgba(16,185,129,0.12)' }
export const MSBo: Record<string, string> = { A_FAIRE: 'rgba(234,179,8,0.3)', EN_COURS: 'rgba(14,165,233,0.3)', TERMINE: 'rgba(16,185,129,0.3)' }
export const MSL: Record<string, string> = { A_FAIRE: 'À faire', EN_COURS: 'En cours', TERMINE: 'Terminée' }

export interface Member { _id: string; name: string; email: string; role: string }

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
  createdAt: string
  updatedAt: string
}

export interface Mission {
  _id: string
  title: string
  description: string
  assignedTo: { _id: string; name: string; email: string }[]
  participants: {
    _id: string
    user: { _id: string; name: string; email: string }
    progress: number
    status: string
    blocked: boolean
    blockedReason: string
  }[]
  status: 'A_FAIRE' | 'EN_COURS' | 'TERMINE'
  progress: number
  dueDate: string | null
  steps: { _id: string; title: string; description: string; done: boolean; waitingReview: boolean; assignedTo?: string }[]
  deliverables: { _id: string; title: string; description: string; done: boolean; assignedTo?: string }[]
  files: { _id: string; originalName: string; mimeType: string; size: number }[]
  createdBy: { name: string }
  createdAt: string
}

export interface MissionFormState {
  title: string
  description: string
  assignedTo: string[]
  dueDate: string
}
