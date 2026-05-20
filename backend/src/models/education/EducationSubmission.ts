import mongoose, { Schema } from 'mongoose'

export const SUBMISSION_STATUSES = [
  'NON_RENDU',
  'EN_RETARD',
  'RENDU',
  'EN_CORRECTION',
  'CORRIGE',
  'NON_VALIDE',
] as const
export type EducationSubmissionStatus = typeof SUBMISSION_STATUSES[number]

export interface ISubmissionFile {
  originalName: string
  storagePath: string
  mimeType: string
  size: number
  uploadedAt: Date
}

export interface IEducationSubmission {
  owner: mongoose.Types.ObjectId
  assignmentId: mongoose.Types.ObjectId
  studentId: mongoose.Types.ObjectId
  status: EducationSubmissionStatus
  submittedAt: Date | null
  files: ISubmissionFile[]
  url: string
  textBody: string
  grade: number | null
  feedback: string
  isLate: boolean
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IEducationSubmission>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: 'EducationAssignment', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'EducationStudent', required: true, index: true },
    status: { type: String, enum: SUBMISSION_STATUSES, default: 'NON_RENDU', index: true },
    submittedAt: { type: Date, default: null },
    files: {
      type: [
        {
          originalName: { type: String, required: true },
          storagePath: { type: String, required: true },
          mimeType: { type: String, required: true },
          size: { type: Number, required: true },
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    url: { type: String, default: '' },
    textBody: { type: String, default: '' },
    grade: { type: Number, default: null },
    feedback: { type: String, default: '' },
    isLate: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
)

schema.index({ owner: 1, assignmentId: 1, studentId: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } })
schema.index({ owner: 1, status: 1, deletedAt: 1 })

export default mongoose.model<IEducationSubmission>('EducationSubmission', schema)
