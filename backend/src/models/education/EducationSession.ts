import mongoose, { Schema } from 'mongoose'

export const SESSION_STATUSES = ['PLANIFIEE', 'EN_COURS', 'TERMINEE', 'ANNULEE'] as const
export type EducationSessionStatus = typeof SESSION_STATUSES[number]

export const ATTENDANCE_STATES = ['PRESENT', 'ABSENT', 'RETARD', 'EXCUSE', 'NON_RENSEIGNE'] as const
export type AttendanceState = typeof ATTENDANCE_STATES[number]

export interface IAttendanceEntry {
  studentId: mongoose.Types.ObjectId
  state: AttendanceState
  comment: string
}

export interface IEducationSession {
  owner: mongoose.Types.ObjectId
  classId: mongoose.Types.ObjectId
  title: string
  theme: string
  objectives: string[]
  agenda: string
  date: Date
  durationMin: number
  location: string
  status: EducationSessionStatus
  attendance: IAttendanceEntry[]
  recap: string
  supports: string[]
  tags: string[]
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IEducationSession>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'EducationClass', required: true, index: true },
    title: { type: String, required: true, trim: true },
    theme: { type: String, default: '', trim: true },
    objectives: { type: [String], default: [] },
    agenda: { type: String, default: '' },
    date: { type: Date, required: true, index: true },
    durationMin: { type: Number, default: 120 },
    location: { type: String, default: '' },
    status: { type: String, enum: SESSION_STATUSES, default: 'PLANIFIEE', index: true },
    attendance: {
      type: [
        {
          studentId: { type: Schema.Types.ObjectId, ref: 'EducationStudent', required: true },
          state: { type: String, enum: ATTENDANCE_STATES, default: 'NON_RENSEIGNE' },
          comment: { type: String, default: '' },
        },
      ],
      default: [],
    },
    recap: { type: String, default: '' },
    supports: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
)

schema.index({ owner: 1, classId: 1, date: -1, deletedAt: 1 })
schema.index({ title: 'text', theme: 'text', recap: 'text' })

export default mongoose.model<IEducationSession>('EducationSession', schema)
