import mongoose, { type Types } from 'mongoose'
import type { ScriptReportOutput } from '../lib/callScriptReport/schema.js'

/**
 * Rapport hebdomadaire des scripts d'appel : un par auteur et par semaine ISO
 * (index unique), produit par `lib/callScriptReport`. Ne référence aucune
 * fiche : seulement des compteurs et des extraits masqués.
 */
export const SCRIPT_REPORT_STATUSES = ['PENDING', 'READY', 'SKIPPED', 'FAILED'] as const
export type ScriptReportStatus = (typeof SCRIPT_REPORT_STATUSES)[number]

export interface ScriptReportStats {
  calls: number
  reached: number
  conversions: number
  /** Conversions sur prospects joints, en % ; `null` si personne n'a été joint. */
  conversionRate: number | null
  targetConversionRate: number
  transcripts: number
  /** Transcripts réellement envoyés au modèle (plafond de jetons). */
  transcriptsAnalyzed: number
  byScript: Array<{ tag: string; calls: number; reached: number; conversions: number }>
}

export interface ICallScriptReport {
  _id: Types.ObjectId
  author: Types.ObjectId
  /** `rep` : commercial externe ; `team` : membre de l'équipe. Fixé à la création. */
  authorKind: 'rep' | 'team'
  weekKey: string
  weekStart: Date
  weekEnd: Date
  status: ScriptReportStatus
  skipReason: 'NO_TRANSCRIPT' | 'AI_DISABLED' | null
  stats: ScriptReportStats
  output: ScriptReportOutput | null
  model: string
  usage: { inputTokens: number; outputTokens: number } | null
  attempts: number
  lockedAt: Date | null
  nextRetryAt: Date | null
  retryable: boolean
  errorCode: string | null
  error: string
  emailState: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'NONE'
  emailedAt: Date | null
  purgeAt: Date
  createdAt: Date
  updatedAt: Date
}

const statsSchema = new mongoose.Schema<ScriptReportStats>(
  {
    calls: Number,
    reached: Number,
    conversions: Number,
    conversionRate: { type: Number, default: null },
    targetConversionRate: Number,
    transcripts: Number,
    transcriptsAnalyzed: Number,
    byScript: [{ _id: false, tag: String, calls: Number, reached: Number, conversions: Number }],
  },
  { _id: false },
)

const callScriptReportSchema = new mongoose.Schema<ICallScriptReport>(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorKind: { type: String, enum: ['rep', 'team'], required: true },
    weekKey: { type: String, required: true },
    weekStart: { type: Date, required: true },
    weekEnd: { type: Date, required: true },
    status: { type: String, enum: SCRIPT_REPORT_STATUSES, default: 'PENDING' },
    skipReason: { type: String, enum: ['NO_TRANSCRIPT', 'AI_DISABLED', null], default: null },
    stats: { type: statsSchema, required: true },
    output: { type: mongoose.Schema.Types.Mixed, default: null },
    model: { type: String, default: '' },
    usage: {
      type: new mongoose.Schema({ inputTokens: Number, outputTokens: Number }, { _id: false }),
      default: null,
    },
    attempts: { type: Number, default: 0 },
    lockedAt: { type: Date, default: null },
    nextRetryAt: { type: Date, default: null },
    retryable: { type: Boolean, default: false },
    errorCode: { type: String, default: null },
    error: { type: String, default: '' },
    emailState: { type: String, enum: ['PENDING', 'SENDING', 'SENT', 'FAILED', 'NONE'], default: 'PENDING' },
    emailedAt: { type: Date, default: null },
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true },
)

callScriptReportSchema.index({ author: 1, weekKey: 1 }, { unique: true })
callScriptReportSchema.index({ status: 1, nextRetryAt: 1 })
callScriptReportSchema.index({ authorKind: 1, weekStart: -1 })
callScriptReportSchema.index({ purgeAt: 1 })

export default mongoose.model<ICallScriptReport>('CallScriptReport', callScriptReportSchema)
