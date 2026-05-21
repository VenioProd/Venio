import mongoose, { Schema } from 'mongoose'

export const STUDENT_STATUSES = ['ACTIVE', 'PAUSE', 'ABANDON', 'TERMINE'] as const
export type EducationStudentStatus = typeof STUDENT_STATUSES[number]

export interface IStudentSource {
  provider: string
  id: string
  url: string
  lastEditedTime: Date | null
}

export interface IEducationStudent {
  owner: mongoose.Types.ObjectId
  classId: mongoose.Types.ObjectId
  firstName: string
  lastName: string
  email: string
  phone: string
  externalId: string
  status: EducationStudentStatus
  tags: string[]
  attendanceCount: number
  absenceCount: number
  lateCount: number
  averageGrade: number | null
  notes: string
  source: IStudentSource | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IEducationStudent>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'EducationClass', required: true, index: true },
    firstName: { type: String, default: '', trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    externalId: { type: String, default: '', trim: true },
    status: { type: String, enum: STUDENT_STATUSES, default: 'ACTIVE', index: true },
    tags: { type: [String], default: [] },
    attendanceCount: { type: Number, default: 0 },
    absenceCount: { type: Number, default: 0 },
    lateCount: { type: Number, default: 0 },
    averageGrade: { type: Number, default: null },
    notes: { type: String, default: '' },
    source: {
      type: new Schema<IStudentSource>(
        {
          provider: { type: String, default: '' },
          id: { type: String, default: '' },
          url: { type: String, default: '' },
          lastEditedTime: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
)

schema.index({ owner: 1, classId: 1, deletedAt: 1 })
schema.index({ firstName: 'text', lastName: 'text', email: 'text', notes: 'text' })
schema.index({ owner: 1, 'source.provider': 1, 'source.id': 1 })

export default mongoose.model<IEducationStudent>('EducationStudent', schema)
