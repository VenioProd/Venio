import mongoose, { Schema, Document } from 'mongoose'

export const BETA_VERDICTS = ['WORKS', 'BROKEN', 'TO_OPTIMIZE'] as const
export type BetaVerdict = (typeof BETA_VERDICTS)[number]

export const BETA_SEVERITIES = ['BLOCKER', 'MAJOR', 'MINOR', 'COSMETIC'] as const
export type BetaSeverity = (typeof BETA_SEVERITIES)[number]

export const BETA_REPRODUCIBILITIES = ['ALWAYS', 'SOMETIMES', 'ONCE'] as const
export type BetaReproducibility = (typeof BETA_REPRODUCIBILITIES)[number]

export const BETA_RUN_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'FIXED', 'REJECTED'] as const
export type BetaRunStatus = (typeof BETA_RUN_STATUSES)[number]

export interface BetaRunContext {
  url: string | null
  userAgent: string | null
  viewportWidth: number | null
  viewportHeight: number | null
  isMobile: boolean | null
}

export interface BetaAttachment {
  _id: mongoose.Types.ObjectId
  originalName: string
  storagePath: string
  mimeType: string
  size: number
  uploadedAt: Date
}

/** Une pièce jointe avant persistance : Mongoose lui attribue son `_id`. */
export type NewBetaAttachment = Omit<BetaAttachment, '_id'>

export const betaAttachmentSchema = new Schema<BetaAttachment>(
  {
    originalName: { type: String, required: true, maxlength: 300 },
    storagePath: { type: String, required: true, maxlength: 500 },
    mimeType: { type: String, required: true, maxlength: 120 },
    size: { type: Number, required: true, min: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
)

export interface IBetaRun extends Document {
  _id: mongoose.Types.ObjectId
  campaign: mongoose.Types.ObjectId
  scenario: mongoose.Types.ObjectId
  tester: mongoose.Types.ObjectId | null
  user: mongoose.Types.ObjectId | null
  verdict: BetaVerdict
  severity: BetaSeverity | null
  reproducibility: BetaReproducibility | null
  failedStep: number | null
  title: string
  body: string
  context: BetaRunContext | null
  attachments: BetaAttachment[]
  confirmations: mongoose.Types.ObjectId[]
  devIssue: mongoose.Types.ObjectId | null
  status: BetaRunStatus
  createdAt: Date
  updatedAt: Date
}

const betaRunSchema = new Schema<IBetaRun>(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'BetaCampaign', required: true, index: true },
    scenario: { type: Schema.Types.ObjectId, ref: 'BetaScenario', required: true, index: true },
    tester: { type: Schema.Types.ObjectId, ref: 'BetaTester', default: null, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    verdict: { type: String, enum: BETA_VERDICTS, required: true, index: true },
    severity: { type: String, enum: [...BETA_SEVERITIES, null], default: null },
    reproducibility: { type: String, enum: [...BETA_REPRODUCIBILITIES, null], default: null },
    failedStep: { type: Number, default: null, min: 1 },
    title: { type: String, default: '', trim: true, maxlength: 200 },
    body: { type: String, default: '', maxlength: 10000 },
    context: {
      type: new Schema<BetaRunContext>(
        {
          url: { type: String, default: null, maxlength: 500 },
          userAgent: { type: String, default: null, maxlength: 500 },
          viewportWidth: { type: Number, default: null, min: 0, max: 100000 },
          viewportHeight: { type: Number, default: null, min: 0, max: 100000 },
          isMobile: { type: Boolean, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    attachments: { type: [betaAttachmentSchema], default: [] },
    confirmations: { type: [{ type: Schema.Types.ObjectId, ref: 'BetaTester' }], default: [] },
    devIssue: { type: Schema.Types.ObjectId, ref: 'DevIssue', default: null, index: true },
    status: { type: String, enum: BETA_RUN_STATUSES, default: 'OPEN', index: true },
  },
  { timestamps: true },
)

/**
 * Un verdict a exactement un auteur : soit un testeur externe invité, soit un
 * membre de l'équipe qui teste lui-même. Les deux à la fois rendrait la
 * couverture et l'anonymisation ambiguës.
 */
betaRunSchema.pre('validate', function (next) {
  const hasTester = Boolean(this.tester)
  const hasUser = Boolean(this.user)
  if (hasTester === hasUser) {
    return next(new Error('Un verdict doit avoir exactement un auteur : un testeur ou un membre'))
  }
  return next()
})

// Un auteur ne détient qu'un verdict courant par démarche : il le révise, il
// n'en empile pas. Les index sont partiels, sans quoi tous les runs d'équipe
// entreraient en collision sur `tester: null`.
betaRunSchema.index(
  { scenario: 1, tester: 1 },
  { unique: true, partialFilterExpression: { tester: { $type: 'objectId' } } },
)
betaRunSchema.index(
  { scenario: 1, user: 1 },
  { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } },
)
betaRunSchema.index({ campaign: 1, status: 1, severity: 1, updatedAt: -1 })

export default mongoose.model<IBetaRun>('BetaRun', betaRunSchema)
