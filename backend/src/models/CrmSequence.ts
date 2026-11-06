import mongoose from 'mongoose'
import { GROUP_ENTITIES, type GroupEntity } from '../lib/groupEntities.js'

/**
 * Séquence d'e-mails du CRM (lot 5) : une suite d'étapes (e-mail, tâche,
 * attente) déroulée lead par lead par le job `crm.sequences`
 * (`lib/crmSequences.ts`). Rien ne part tant que la séquence n'est pas ACTIVE.
 */
export const SEQUENCE_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED'] as const
export type SequenceStatus = (typeof SEQUENCE_STATUSES)[number]
export const SEQUENCE_STEP_TYPES = ['EMAIL', 'TASK', 'WAIT'] as const
export type SequenceStepType = (typeof SEQUENCE_STEP_TYPES)[number]
/** Statuts de lead qui arrêtent une inscription par défaut. */
export const DEFAULT_STOP_STATUSES = ['WON', 'LOST']
/** Plage d'heures d'envoi permise (heure de Paris). */
export const SEND_HOUR_MIN = 8
export const SEND_HOUR_MAX = 19
export const DEFAULT_SEND_HOUR = 9
export const SEQUENCE_MAX_STEPS = 20

export interface ISequenceStep {
  type: SequenceStepType
  /** Jours calendaires d'attente depuis l'étape précédente (ou l'inscription), reportés au jour ouvré suivant. */
  delayDays: number
  /** Heure d'exécution, heure de Paris (8 à 19). */
  sendHourParis: number
  subject: string
  body: string
  taskTitle: string
}

export interface ISequenceStopOn {
  reply: boolean
  statusChange: boolean
  statuses: string[]
}

export interface ICrmSequence {
  _id: mongoose.Types.ObjectId
  name: string
  description: string
  entity: GroupEntity | null
  status: SequenceStatus
  steps: ISequenceStep[]
  stopOn: ISequenceStopOn
  createdBy: mongoose.Types.ObjectId | null
  updatedBy: mongoose.Types.ObjectId | null
  activatedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const stepSchema = new mongoose.Schema<ISequenceStep>(
  {
    type: { type: String, enum: SEQUENCE_STEP_TYPES, required: true },
    delayDays: { type: Number, default: 0, min: 0, max: 365 },
    sendHourParis: { type: Number, default: DEFAULT_SEND_HOUR, min: SEND_HOUR_MIN, max: SEND_HOUR_MAX },
    subject: { type: String, default: '', maxlength: 300 },
    body: { type: String, default: '', maxlength: 20000 },
    taskTitle: { type: String, default: '', maxlength: 300 },
  },
  { _id: false },
)

const sequenceSchema = new mongoose.Schema<ICrmSequence>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 500 },
    entity: { type: String, enum: [...GROUP_ENTITIES, null], default: null },
    status: { type: String, enum: SEQUENCE_STATUSES, default: 'DRAFT' },
    steps: { type: [stepSchema], default: [] },
    stopOn: {
      reply: { type: Boolean, default: true },
      statusChange: { type: Boolean, default: true },
      statuses: { type: [String], default: () => [...DEFAULT_STOP_STATUSES] },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    activatedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

sequenceSchema.index({ status: 1 })

export default mongoose.model<ICrmSequence>('CrmSequence', sequenceSchema)
