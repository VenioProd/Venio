import mongoose, { Schema } from 'mongoose'

export const DOC_PARENT_TYPES = ['class', 'session', 'assignment', 'submission', 'student', 'note', 'standalone'] as const
export type EducationDocumentParentType = typeof DOC_PARENT_TYPES[number]

export interface IEducationDocument {
  owner: mongoose.Types.ObjectId
  parentType: EducationDocumentParentType
  parentId: mongoose.Types.ObjectId | null
  title: string
  originalName: string
  storagePath: string
  mimeType: string
  size: number
  url: string
  tags: string[]
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IEducationDocument>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parentType: { type: String, enum: DOC_PARENT_TYPES, default: 'standalone', index: true },
    parentId: { type: Schema.Types.ObjectId, default: null, index: true },
    title: { type: String, default: '', trim: true },
    originalName: { type: String, default: '' },
    storagePath: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    url: { type: String, default: '' },
    tags: { type: [String], default: [] },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
)

schema.index({ owner: 1, parentType: 1, parentId: 1, deletedAt: 1 })
schema.index({ title: 'text', originalName: 'text' })

export default mongoose.model<IEducationDocument>('EducationDocument', schema)
