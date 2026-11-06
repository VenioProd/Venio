import mongoose from 'mongoose'

/**
 * Inscription d'un lead à une séquence (lot 5). Une seule inscription ouverte
 * (ACTIVE ou PAUSED) par couple séquence / lead : `openKey` n'est posé que
 * tant que l'inscription est ouverte et porte un index unique partiel.
 */
export const ENROLLMENT_STATUSES = ['ACTIVE', 'COMPLETED', 'STOPPED', 'PAUSED'] as const
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number]
export const OPEN_ENROLLMENT_STATUSES: EnrollmentStatus[] = ['ACTIVE', 'PAUSED']

/** Raisons d'arrêt d'une inscription. */
export const STOP_REASONS = [
  'REPLY',
  'STATUS_CHANGE',
  'DO_NOT_CONTACT',
  'UNSUBSCRIBE',
  'ANONYMIZED',
  'ARCHIVED',
  'NO_EMAIL',
  'MANUAL',
  'LEAD_DELETED',
  'SEND_FAILED',
] as const
export type StopReason = (typeof STOP_REASONS)[number]

export interface IEnrollmentHistory {
  step: number
  type: string
  status: 'OK' | 'SKIP' | 'ERR' | 'INFO'
  message: string
  at: Date
}

export interface ICrmSequenceEnrollment {
  _id: mongoose.Types.ObjectId
  sequence: mongoose.Types.ObjectId
  lead: mongoose.Types.ObjectId
  /** Index de la prochaine étape à exécuter. */
  currentStep: number
  status: EnrollmentStatus
  nextRunAt: Date | null
  stoppedReason: StopReason | null
  enrolledAt: Date
  enrolledBy: mongoose.Types.ObjectId | null
  completedAt: Date | null
  stoppedAt: Date | null
  /** Tentatives en échec de l'étape courante (envoi SMTP refusé). */
  attempts: number
  openKey?: string
  history: IEnrollmentHistory[]
  createdAt: Date
  updatedAt: Date
}

const historySchema = new mongoose.Schema<IEnrollmentHistory>(
  {
    step: { type: Number, required: true },
    type: { type: String, default: '' },
    status: { type: String, enum: ['OK', 'SKIP', 'ERR', 'INFO'], required: true },
    message: { type: String, default: '' },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
)

const enrollmentSchema = new mongoose.Schema<ICrmSequenceEnrollment>(
  {
    sequence: { type: mongoose.Schema.Types.ObjectId, ref: 'CrmSequence', required: true },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
    currentStep: { type: Number, default: 0 },
    status: { type: String, enum: ENROLLMENT_STATUSES, default: 'ACTIVE' },
    nextRunAt: { type: Date, default: null },
    stoppedReason: { type: String, enum: [...STOP_REASONS, null], default: null },
    enrolledAt: { type: Date, default: () => new Date() },
    enrolledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    completedAt: { type: Date, default: null },
    stoppedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    // Pas de valeur par défaut : absent dès que l'inscription est close (index partiel).
    openKey: { type: String },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true },
)

/** Clé d'unicité d'une inscription ouverte. */
export const enrollmentOpenKey = (sequenceId: unknown, leadId: unknown) => `${String(sequenceId)}:${String(leadId)}`

// File du moteur : inscriptions actives échues.
enrollmentSchema.index({ status: 1, nextRunAt: 1 })
enrollmentSchema.index({ lead: 1, status: 1 })
enrollmentSchema.index({ sequence: 1, status: 1 })
enrollmentSchema.index({ openKey: 1 }, { unique: true, partialFilterExpression: { openKey: { $type: 'string' } } })

export default mongoose.model<ICrmSequenceEnrollment>('CrmSequenceEnrollment', enrollmentSchema)
