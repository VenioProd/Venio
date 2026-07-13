import mongoose, { Schema } from 'mongoose'

export const EDUCATION_AI_MODES = [
  'session_plan',
  'session_synthesis',
  'assignment_feedback',
  'class_council_prep',
  'checklist_action_plan',
] as const
export type EducationAiMode = (typeof EDUCATION_AI_MODES)[number]

export interface IEducationAiGeneration {
  owner: mongoose.Types.ObjectId
  actor: mongoose.Types.ObjectId
  mode: EducationAiMode
  engine: string
  inputFields: string[]
  outputFingerprint: string
  reviewedAt: Date | null
  reviewedBy: mongoose.Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Deliberately metadata-only. Inputs and generated drafts can include learner
 * data, so they are returned to the requesting browser but never retained here.
 */
const schema = new Schema<IEducationAiGeneration>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mode: { type: String, enum: EDUCATION_AI_MODES, required: true, index: true },
    engine: { type: String, required: true },
    inputFields: { type: [String], default: [] },
    outputFingerprint: { type: String, required: true },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

schema.index({ owner: 1, createdAt: -1 })

export default mongoose.model<IEducationAiGeneration>('EducationAiGeneration', schema)
