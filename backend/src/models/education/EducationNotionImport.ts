import mongoose, { Schema } from 'mongoose'

export const NOTION_IMPORT_SOURCE_TYPES = ['page', 'database'] as const
export type NotionImportSourceType = typeof NOTION_IMPORT_SOURCE_TYPES[number]

export const NOTION_IMPORT_STATUSES = ['pending', 'running', 'success', 'partial', 'error'] as const
export type NotionImportStatus = typeof NOTION_IMPORT_STATUSES[number]

export interface INotionImportStats {
  created: number
  updated: number
  skipped: number
  errors: number
}

export interface IEducationNotionImport {
  owner: mongoose.Types.ObjectId
  sourceType: NotionImportSourceType
  pageId: string
  databaseId: string
  sourceUrl: string
  classId: mongoose.Types.ObjectId | null
  dryRun: boolean
  status: NotionImportStatus
  stats: INotionImportStats
  messages: string[]
  errors: string[]
  startedAt: Date
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const statsSchema = new Schema<INotionImportStats>(
  {
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    errors: { type: Number, default: 0 },
  },
  { _id: false }
)

const schema = new Schema<IEducationNotionImport>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sourceType: { type: String, enum: NOTION_IMPORT_SOURCE_TYPES, required: true },
    pageId: { type: String, default: '', index: true },
    databaseId: { type: String, default: '', index: true },
    sourceUrl: { type: String, default: '' },
    classId: { type: Schema.Types.ObjectId, ref: 'EducationClass', default: null },
    dryRun: { type: Boolean, default: false },
    status: { type: String, enum: NOTION_IMPORT_STATUSES, default: 'pending', index: true },
    stats: { type: statsSchema, default: () => ({ created: 0, updated: 0, skipped: 0, errors: 0 }) },
    messages: { type: [String], default: [] },
    errors: { type: [String], default: [] },
    startedAt: { type: Date, default: () => new Date() },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, suppressReservedKeysWarning: true }
)

schema.index({ owner: 1, createdAt: -1 })

export default mongoose.model<IEducationNotionImport>('EducationNotionImport', schema)
