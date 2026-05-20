import mongoose, { Schema } from 'mongoose'

export const TEMPLATE_KINDS = ['session', 'assignment', 'note', 'class'] as const
export type EducationTemplateKind = typeof TEMPLATE_KINDS[number]

export interface IEducationTemplate {
  owner: mongoose.Types.ObjectId
  kind: EducationTemplateKind
  name: string
  description: string
  body: Record<string, unknown>
  tags: string[]
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IEducationTemplate>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: TEMPLATE_KINDS, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    body: { type: Schema.Types.Mixed, default: {} },
    tags: { type: [String], default: [] },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
)

schema.index({ owner: 1, kind: 1, deletedAt: 1 })

export default mongoose.model<IEducationTemplate>('EducationTemplate', schema)
