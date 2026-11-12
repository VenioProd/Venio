import mongoose, { type Document, type Types } from 'mongoose'

export const TRANSCRIPT_STATUSES = ['PENDING', 'PROCESSING', 'DONE', 'FAILED', 'SKIPPED'] as const
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number]

export interface TranscriptSegment {
  speaker: 'REP' | 'PROSPECT'
  startMs: number
  endMs: number
  text: string
}

export interface ICallTranscript extends Document {
  call: Types.ObjectId
  lead: Types.ObjectId
  author: Types.ObjectId
  provider: 'assemblyai'
  providerJobId: string | null
  language: string
  status: TranscriptStatus
  segments: TranscriptSegment[]
  durationSec: number | null
  error: string
  purgeAt: Date
  // Mécanique interne de la chaîne : jamais exposée par la route.
  channels: 1 | 2
  repChannel: 0 | 1
  attempts: number
  leaseUntil: Date | null
  submittedAt: Date | null
  providerDeletedAt: Date | null
  doneNotifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const segmentSchema = new mongoose.Schema<TranscriptSegment>(
  {
    speaker: { type: String, enum: ['REP', 'PROSPECT'], required: true },
    startMs: { type: Number, required: true },
    endMs: { type: Number, required: true },
    text: { type: String, default: '' },
  },
  { _id: false },
)

const callTranscriptSchema = new mongoose.Schema<ICallTranscript>(
  {
    // Le modèle Call arrive avec le lot A : la référence ne dépend que de son nom.
    call: { type: mongoose.Schema.Types.ObjectId, ref: 'Call', required: true, unique: true },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, enum: ['assemblyai'], default: 'assemblyai' },
    providerJobId: { type: String, default: null },
    language: { type: String, required: true },
    status: { type: String, enum: TRANSCRIPT_STATUSES, default: 'PENDING' },
    segments: { type: [segmentSchema], default: [] },
    durationSec: { type: Number, default: null },
    error: { type: String, default: '' },
    purgeAt: { type: Date, required: true },
    channels: { type: Number, enum: [1, 2], required: true },
    repChannel: { type: Number, enum: [0, 1], default: 0 },
    attempts: { type: Number, default: 0 },
    leaseUntil: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    providerDeletedAt: { type: Date, default: null },
    doneNotifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

callTranscriptSchema.index({ status: 1, leaseUntil: 1 })
callTranscriptSchema.index({ purgeAt: 1 })
callTranscriptSchema.index({ lead: 1 })

export default mongoose.model<ICallTranscript>('CallTranscript', callTranscriptSchema)
