import mongoose, { Schema } from 'mongoose'

export const ASSIGNMENT_STATUSES = ['DRAFT', 'OUVERT', 'EN_CORRECTION', 'CLOS', 'ARCHIVE'] as const
export type EducationAssignmentStatus = typeof ASSIGNMENT_STATUSES[number]

export const ASSIGNMENT_KINDS = ['DEVOIR', 'PROJET', 'EXPOSE', 'QCM', 'EXAMEN', 'AUTRE'] as const
export type EducationAssignmentKind = typeof ASSIGNMENT_KINDS[number]

export interface IEducationAssignment {
  owner: mongoose.Types.ObjectId
  classId: mongoose.Types.ObjectId
  sessionId: mongoose.Types.ObjectId | null
  title: string
  kind: EducationAssignmentKind
  instructions: string
  deadline: Date | null
  maxGrade: number
  weight: number
  status: EducationAssignmentStatus
  expectedDeliverables: string[]
  groupMode: boolean
  tags: string[]
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IEducationAssignment>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'EducationClass', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'EducationSession', default: null },
    title: { type: String, required: true, trim: true },
    kind: { type: String, enum: ASSIGNMENT_KINDS, default: 'DEVOIR' },
    instructions: { type: String, default: '' },
    deadline: { type: Date, default: null, index: true },
    maxGrade: { type: Number, default: 20 },
    weight: { type: Number, default: 1 },
    status: { type: String, enum: ASSIGNMENT_STATUSES, default: 'DRAFT', index: true },
    expectedDeliverables: { type: [String], default: [] },
    groupMode: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
)

schema.index({ owner: 1, classId: 1, status: 1, deadline: 1, deletedAt: 1 })
schema.index({ title: 'text', instructions: 'text' })

export default mongoose.model<IEducationAssignment>('EducationAssignment', schema)
