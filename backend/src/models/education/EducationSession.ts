import mongoose, { Schema } from 'mongoose'
import {
  type ISessionRemark,
  type ISessionLink,
  type ISessionReminder,
  type ISessionDuty,
  remarkSchema,
  linkSchema,
  reminderSchema,
  dutySchema,
} from './sessionWorkspace.js'

export const SESSION_STATUSES = ['PLANIFIEE', 'EN_COURS', 'TERMINEE', 'ANNULEE'] as const
export type EducationSessionStatus = typeof SESSION_STATUSES[number]

export const ATTENDANCE_STATES = ['PRESENT', 'ABSENT', 'RETARD', 'EXCUSE', 'NON_RENSEIGNE'] as const
export type AttendanceState = typeof ATTENDANCE_STATES[number]

export interface IAttendanceEntry {
  studentId: mongoose.Types.ObjectId
  state: AttendanceState
  comment: string
}

// VENIO-43 — Les sous-types de workspace (remarques, liens, rappels, devoirs,
// notes libres) sont partagés avec EducationCalendarEventWorkspace : un seul
// modèle de fiche exploitable, exposable depuis n'importe quelle entrée
// (séance interne ou événement Apple Calendar). Voir ./sessionWorkspace.ts.
export type {
  ISessionRemark,
  ISessionLink,
  ISessionReminder,
  ISessionDuty,
} from './sessionWorkspace.js'

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
