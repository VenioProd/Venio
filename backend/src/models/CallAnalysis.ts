import mongoose, { type Types } from 'mongoose'
import type { CallAnalysisOutput } from '../lib/callAnalysis/schema.js'

export const CALL_ANALYSIS_STATUSES = ['PENDING', 'READY', 'APPLIED', 'PARTIAL', 'REJECTED', 'FAILED'] as const
export type CallAnalysisStatus = (typeof CALL_ANALYSIS_STATUSES)[number]

/** Codes d'échec : seul `API_ERROR` retryable est relancé par le balayage. */
export const CALL_ANALYSIS_ERRORS = [
  'DISABLED',
  'EMPTY_TRANSCRIPT',
  'TRANSCRIPT_UNAVAILABLE',
  'LEAD_UNAVAILABLE',
  'REFUSED',
  'INVALID_OUTPUT',
  'API_ERROR',
] as const

export interface ICallAnalysisDecision {
  path: string
  action: 'ACCEPT' | 'EDIT' | 'IGNORE'
  before: unknown
  after: unknown
}

// Sans `extends Document` : le champ `model` du contrat masquerait la méthode du même nom dans les types.
export interface ICallAnalysis {
  _id: Types.ObjectId
  call: Types.ObjectId
  lead: Types.ObjectId
  author: Types.ObjectId
  model: string
  promptVersion: string
  status: CallAnalysisStatus
  output: CallAnalysisOutput | null
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens: number
    cacheWriteInputTokens: number
  } | null
  review: {
    by: Types.ObjectId
    at: Date
    decisions: ICallAnalysisDecision[]
    clientRequestId: string | null
    requestHash: string | null
  } | null
  error: string
  errorCode: (typeof CALL_ANALYSIS_ERRORS)[number] | null
  retryable: boolean
  attempts: number
  callDate: Date
  durationSec: number | null
  lockedAt: Date | null
  nextRetryAt: Date | null
  purgeAt: Date
  createdAt: Date
  updatedAt: Date
}

const callAnalysisSchema = new mongoose.Schema<ICallAnalysis>(
  {
    call: { type: mongoose.Schema.Types.ObjectId, ref: 'Call', required: true },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    model: { type: String, default: '' },
    promptVersion: { type: String, default: '' },
    status: { type: String, enum: CALL_ANALYSIS_STATUSES, default: 'PENDING' },
    // Sortie validée et complétée par le serveur (citations vérifiées, chaleur recalculée).
    output: { type: mongoose.Schema.Types.Mixed, default: null },
    usage: { type: mongoose.Schema.Types.Mixed, default: null },
    review: {
      type: new mongoose.Schema(
        {
          by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          at: { type: Date, required: true },
          decisions: { type: [mongoose.Schema.Types.Mixed], default: [] },
          clientRequestId: { type: String, default: null },
          requestHash: { type: String, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    error: { type: String, default: '', maxlength: 500 },
    errorCode: { type: String, enum: [...CALL_ANALYSIS_ERRORS, null], default: null },
    retryable: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
    // Date de l'appel (pour les dates relatives de la transcription) et durée.
    callDate: { type: Date, required: true },
    durationSec: { type: Number, default: null },
    // Verrou d'exécution : une seule analyse en cours par document.
    lockedAt: { type: Date, default: null },
    nextRetryAt: { type: Date, default: null },
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true },
)

callAnalysisSchema.index({ call: 1 }, { unique: true })
callAnalysisSchema.index({ lead: 1, createdAt: -1 })
callAnalysisSchema.index({ status: 1, nextRetryAt: 1 })
callAnalysisSchema.index({ purgeAt: 1 })

export default mongoose.model<ICallAnalysis>('CallAnalysis', callAnalysisSchema)
