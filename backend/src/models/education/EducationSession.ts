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

// VENIO-43 — Enrichissements de fiche séance : à utiliser depuis le cockpit,
// le calendrier ou la classe pour capturer notes, remarques, liens, rappels
// et devoirs à donner sans quitter la séance.
export interface ISessionRemark {
  id: string
  text: string
  createdAt: Date
}

export interface ISessionLink {
  id: string
  label: string
  url: string
}

export interface ISessionReminder {
  id: string
  label: string
  dueAt: Date | null
  done: boolean
}

export interface ISessionDuty {
  id: string
  label: string
  dueAt: Date | null
  done: boolean
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
  notes: string
  remarks: ISessionRemark[]
  links: ISessionLink[]
  reminders: ISessionReminder[]
  duties: ISessionDuty[]
  supports: string[]
  tags: string[]
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function makeShortId(): string {
  return Math.random().toString(36).slice(2, 10)
}

const remarkSchema = new Schema<ISessionRemark>(
  {
    id: { type: String, default: makeShortId },
    text: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
)

const linkSchema = new Schema<ISessionLink>(
  {
    id: { type: String, default: makeShortId },
    label: { type: String, default: '', trim: true },
    url: { type: String, default: '', trim: true },
  },
  { _id: false }
)

const reminderSchema = new Schema<ISessionReminder>(
  {
    id: { type: String, default: makeShortId },
    label: { type: String, default: '', trim: true },
    dueAt: { type: Date, default: null },
    done: { type: Boolean, default: false },
  },
  { _id: false }
)

const dutySchema = new Schema<ISessionDuty>(
  {
    id: { type: String, default: makeShortId },
    label: { type: String, default: '', trim: true },
    dueAt: { type: Date, default: null },
    done: { type: Boolean, default: false },
  },
  { _id: false }
)

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
    notes: { type: String, default: '' },
    remarks: { type: [remarkSchema], default: [] },
    links: { type: [linkSchema], default: [] },
    reminders: { type: [reminderSchema], default: [] },
    duties: { type: [dutySchema], default: [] },
    supports: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
)

schema.index({ owner: 1, classId: 1, date: -1, deletedAt: 1 })
schema.index({ title: 'text', theme: 'text', recap: 'text', notes: 'text' })

export default mongoose.model<IEducationSession>('EducationSession', schema)
