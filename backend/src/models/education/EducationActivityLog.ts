import mongoose, { Schema } from 'mongoose'

export const EDU_ENTITY_TYPES = [
  'class',
  'student',
  'session',
  'assignment',
  'submission',
  'note',
  'document',
  'template',
] as const
export type EduEntityType = typeof EDU_ENTITY_TYPES[number]

export const EDU_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'RESTORE', 'GRADE', 'SUBMIT'] as const
export type EduAction = typeof EDU_ACTIONS[number]

export interface IEducationActivityLog {
  owner: mongoose.Types.ObjectId
  actor: mongoose.Types.ObjectId
  entityType: EduEntityType
  entityId: mongoose.Types.ObjectId
  action: EduAction
  payload: Record<string, unknown>
  createdAt: Date
}

const schema = new Schema<IEducationActivityLog>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    entityType: { type: String, enum: EDU_ENTITY_TYPES, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    action: { type: String, enum: EDU_ACTIONS, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

schema.index({ owner: 1, createdAt: -1 })
schema.index({ entityType: 1, entityId: 1, createdAt: -1 })

export default mongoose.model<IEducationActivityLog>('EducationActivityLog', schema)
