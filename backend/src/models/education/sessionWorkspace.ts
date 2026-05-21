import { Schema } from 'mongoose'

/**
 * VENIO-44 — Fragment de "workspace" pédagogique partagé.
 *
 * Les mêmes blocs (notes libres, remarques datées, liens, rappels, devoirs)
 * sont attachés à deux entités différentes :
 *   - EducationSession : séance interne, créée dans Venio.
 *   - EducationCalendarEventWorkspace : "fiche" rattachée à un événement
 *     Apple Calendar (ICS, externe), sans toucher à l'événement source.
 *
 * Pour éviter la duplication, les sous-schémas Mongoose et les interfaces
 * vivent ici et sont importés des deux côtés. Les helpers de normalisation
 * vivent à part dans routes/admin/education/workspaceHelpers.ts pour rester
 * proches des routes qui les utilisent.
 */

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

export function makeShortId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export const remarkSchema = new Schema<ISessionRemark>(
  {
    id: { type: String, default: makeShortId },
    text: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
)

export const linkSchema = new Schema<ISessionLink>(
  {
    id: { type: String, default: makeShortId },
    label: { type: String, default: '', trim: true },
    url: { type: String, default: '', trim: true },
  },
  { _id: false }
)

export const reminderSchema = new Schema<ISessionReminder>(
  {
    id: { type: String, default: makeShortId },
    label: { type: String, default: '', trim: true },
    dueAt: { type: Date, default: null },
    done: { type: Boolean, default: false },
  },
  { _id: false }
)

export const dutySchema = new Schema<ISessionDuty>(
  {
    id: { type: String, default: makeShortId },
    label: { type: String, default: '', trim: true },
    dueAt: { type: Date, default: null },
    done: { type: Boolean, default: false },
  },
  { _id: false }
)
