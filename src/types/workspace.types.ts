export type PersonalTaskStatus = 'A_FAIRE' | 'EN_COURS' | 'TERMINE'
export type WorkspaceNoteType = 'NOTE' | 'POSTIT' | 'DRAFT' | 'IDEA'

export interface WidgetConfig {
  key: string
  enabled: boolean
  x: number
  y: number
  w: number
  h: number
}

export interface Shortcut { label: string; link: string; icon?: string }

export interface WorkspaceLayout {
  widgets: WidgetConfig[]
  shortcuts: Shortcut[]
  dailyGoal: { text: string; date: string } | null
}

export interface PersonalTask {
  _id: string
  title: string
  description?: string
  status: PersonalTaskStatus
  priority: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
  dueDate?: string | null
  order: number
  source?: 'PERSONAL' | 'PROJECT'
  project?: { _id: string; name: string }
}

export interface WorkspaceNote {
  _id: string
  type: WorkspaceNoteType
  title: string
  content: string
  color?: string
  pinned?: boolean
  status?: 'NEW' | 'CONVERTED'
  order: number
  tags?: string[]
  updatedAt?: string
}

export interface RoleKpi { label: string; value: number; link: string }

export interface WorkspaceOverview {
  kpis: RoleKpi[]
  overdue: PersonalTask[]
  week: PersonalTask[]
  pinned: { _id: string; title: string; link: string; color?: string }[]
  activity: { _id: string; title: string; message: string; link: string; createdAt: string }[]
}
