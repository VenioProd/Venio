import type { Document, Types } from 'mongoose'
import type { TaskStatus, TaskPriority } from '../enums.js'

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
  isArchived: boolean
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
