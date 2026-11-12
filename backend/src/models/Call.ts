import mongoose, { Schema, type Types } from 'mongoose'

/**
 * Appel passé depuis le navigateur (lot A, téléphonie). Il existe dès le
 * lancement, avant que le commercial n'enregistre un résultat : `to` est
 * toujours résolu par le serveur depuis le lead, jamais reçu du navigateur.
 */
export const CALL_STATUSES = [
  'CREATED',
  'RINGING',
  'IN_PROGRESS',
  'COMPLETED',
  'NO_ANSWER',
  'BUSY',
  'FAILED',
  'CANCELED',
] as const
export type CallStatus = (typeof CALL_STATUSES)[number]
export const TERMINAL_CALL_STATUSES: readonly CallStatus[] = ['COMPLETED', 'NO_ANSWER', 'BUSY', 'FAILED', 'CANCELED']

/**
 * Enregistrement double piste (vague 2). `NONE` : demandé mais pas commencé, ou
 * absent ; `STOPPED` : arrêté sur opposition, audio pas encore effacé ; `READY` :
 * audio disponible chez l'opérateur ; `DELETED` : effacé chez l'opérateur.
 */
export const RECORDING_STATUSES = ['NONE', 'RECORDING', 'STOPPED', 'READY', 'DELETED'] as const
export type RecordingStatus = (typeof RECORDING_STATUSES)[number]

export interface ICallRecording {
  status: RecordingStatus
  /** Annonce jouée à l'appelé avant la mise en relation. */
  notice: boolean
  /** Opposition du prospect : audio effacé, aucun transcript. */
  objection: boolean
  objectionAt: Date | null
  sid: string | null
  channels: number | null
  durationSec: number | null
  completedAt: Date | null
  /** Échéance d'effacement chez l'opérateur ; `null` tant que le transcript n'est pas obtenu. */
  deleteAt: Date | null
  deletedAt: Date | null
}

export interface ICall {
  _id: Types.ObjectId
  lead: Types.ObjectId
  author: Types.ObjectId
  provider: 'twilio'
  providerCallSid: string | null
  direction: 'OUT'
  to: string
  from: string
  status: CallStatus
  startedAt: Date | null
  answeredAt: Date | null
  endedAt: Date | null
  durationSec: number | null
  answeredBy: 'HUMAN' | 'MACHINE' | 'UNKNOWN'
  interaction: Types.ObjectId | null
  clientRequestId: string
  /** Jour local (fuseau des réglages, AAAA-MM-JJ) et rang de la tentative vers `to` ce jour-là. */
  attemptDay: string
  attemptNo: number
  recording: ICallRecording | null
  events: { status: string; at: Date }[]
  createdAt: Date
  updatedAt: Date
}

const callSchema = new Schema<ICall>(
  {
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, enum: ['twilio'], default: 'twilio' },
    providerCallSid: { type: String, default: null },
    direction: { type: String, enum: ['OUT'], default: 'OUT' },
    to: { type: String, required: true },
    from: { type: String, required: true },
    status: { type: String, enum: [...CALL_STATUSES], default: 'CREATED' },
    startedAt: { type: Date, default: null },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    durationSec: { type: Number, default: null, min: 0 },
    answeredBy: { type: String, enum: ['HUMAN', 'MACHINE', 'UNKNOWN'], default: 'UNKNOWN' },
    interaction: { type: Schema.Types.ObjectId, ref: 'Interaction', default: null },
    clientRequestId: { type: String, required: true },
    attemptDay: { type: String, required: true },
    attemptNo: { type: Number, required: true, min: 1 },
    // `null` : appel non enregistré (réglage coupé, ou rien à en faire).
    recording: {
      type: new Schema<ICallRecording>(
        {
          status: { type: String, enum: [...RECORDING_STATUSES], default: 'NONE' },
          notice: { type: Boolean, default: false },
          objection: { type: Boolean, default: false },
          objectionAt: { type: Date, default: null },
          sid: { type: String, default: null },
          channels: { type: Number, default: null },
          durationSec: { type: Number, default: null },
          completedAt: { type: Date, default: null },
          deleteAt: { type: Date, default: null },
          deletedAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    events: { type: [{ _id: false, status: { type: String, required: true }, at: { type: Date, required: true } }] },
  },
  { timestamps: true },
)

callSchema.index(
  { providerCallSid: 1 },
  { unique: true, partialFilterExpression: { providerCallSid: { $type: 'string' } } },
)
callSchema.index({ author: 1, clientRequestId: 1 }, { unique: true })
// Le rang est réservé par l'index : deux lancements simultanés ne dépassent pas le plafond.
callSchema.index({ to: 1, attemptDay: 1, attemptNo: 1 }, { unique: true })
callSchema.index({ lead: 1, createdAt: -1 })
callSchema.index(
  { 'recording.status': 1, 'recording.deleteAt': 1 },
  { partialFilterExpression: { recording: { $type: 'object' } } },
)
callSchema.index({ status: 1, createdAt: 1 })
callSchema.index({ interaction: 1 }, { partialFilterExpression: { interaction: { $type: 'objectId' } } })

export default mongoose.model<ICall>('Call', callSchema)
