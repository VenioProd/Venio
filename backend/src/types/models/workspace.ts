// backend/src/types/models/workspace.ts
import type { Document, Types } from 'mongoose'
import type { PersonalTaskStatus, PersonalTaskPriority, WorkspaceNoteType, WorkspaceNoteStatus } from '../enums.js'

export type { PersonalTaskStatus, PersonalTaskPriority, WorkspaceNoteType, WorkspaceNoteStatus }

export interface IWorkspaceWidget {
  key: string
  enabled: boolean
  x: number
  y: number
  w: number
  h: number
}

export interface IWorkspaceShortcut {
  label: string
  link: string
  icon?: string
}

export interface IWorkspaceLayout extends Document {
  userId: Types.ObjectId
  widgets: IWorkspaceWidget[]
  shortcuts: IWorkspaceShortcut[]
  dailyGoal: { text: string; date: Date } | null
  createdAt: Date
  updatedAt: Date
}

export interface IPersonalTask extends Document {
  userId: Types.ObjectId
  title: string
  description: string
  status: PersonalTaskStatus
  priority: PersonalTaskPriority
  dueDate: Date | null
  order: number
  isArchived: boolean
  sourceIdeaId: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

export interface IWorkspaceNote extends Document {
  userId: Types.ObjectId
  type: WorkspaceNoteType
  title: string
  content: string
  color: string
  pinned: boolean
  status: WorkspaceNoteStatus
  order: number
  tags: string[]
  createdAt: Date
  updatedAt: Date
}
