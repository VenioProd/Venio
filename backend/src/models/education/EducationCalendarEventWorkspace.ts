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

/**
 * VENIO-44 — Workspace pédagogique attaché à un événement de calendrier
 * externe (Apple Calendar / ICS).
 *
 * On ne modifie JAMAIS l'événement Apple lui-même (lecture seule). À la place,
 * on persiste côté Venio une fiche exploitable indexée par occurrenceId (UID
 * + occurrence pour les RRULE). Les champs uid/start/title/source/classId
 * sont stockés pour faciliter le ré-affichage hors-ligne et le rattachement
 * implicite à une EducationClass.
 *
 * Le contenu (notes/remarques/liens/rappels/devoirs) est partagé en types
 * avec EducationSession via sessionWorkspace.ts.
 */

export type CalendarEventSource = 'Apple Calendar'

export interface IEducationCalendarEventWorkspace {
  owner: mongoose.Types.ObjectId
  occurrenceId: string
  uid: string
  source: CalendarEventSource
  title: string
  start: Date | null
  classId: mongoose.Types.ObjectId | null
  notes: string
  remarks: ISessionRemark[]
  links: ISessionLink[]
  reminders: ISessionReminder[]
  duties: ISessionDuty[]
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IEducationCalendarEventWorkspace>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    occurrenceId: { type: String, required: true, index: true },
    uid: { type: String, default: '' },
    source: { type: String, default: 'Apple Calendar' },
    title: { type: String, default: '' },
    start: { type: Date, default: null },
    classId: { type: Schema.Types.ObjectId, ref: 'EducationClass', default: null, index: true },
    notes: { type: String, default: '' },
    remarks: { type: [remarkSchema], default: [] },
    links: { type: [linkSchema], default: [] },
    reminders: { type: [reminderSchema], default: [] },
    duties: { type: [dutySchema], default: [] },
  },
  { timestamps: true }
)

// Une fiche unique par (owner, occurrenceId). C'est l'idempotence clé pour
// que GET/PUT sur la même occurrence revienne toujours sur le même doc.
schema.index({ owner: 1, occurrenceId: 1 }, { unique: true })

export default mongoose.model<IEducationCalendarEventWorkspace>(
  'EducationCalendarEventWorkspace',
  schema,
)
