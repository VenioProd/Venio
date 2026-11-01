import mongoose from 'mongoose'

export const RUN_STATUSES = ['OK', 'ERR', 'SKIP', 'SIM', 'PENDING', 'RUNNING'] as const

export interface IRunStep {
  action: string
  status: 'OK' | 'ERR' | 'SKIP' | 'PENDING'
  message: string
  payload?: Record<string, unknown>
  at: Date
}
export interface ICrmRuleRun extends mongoose.Document {
  rule: mongoose.Types.ObjectId
  ruleName: string
  lead: mongoose.Types.ObjectId
  leadLabel: string
  eventKey: string
  trigger: string
  status: (typeof RUN_STATUSES)[number]
  steps: IRunStep[]
  depth: number
  durationMs: number
  createdAt: Date
}

/** Une exécution = un déclenchement d'une règle sur un lead. Conservée 90 jours. */
const crmRuleRunSchema = new mongoose.Schema<ICrmRuleRun>(
  {
    rule: { type: mongoose.Schema.Types.ObjectId, ref: 'CrmRule', required: true },
    ruleName: { type: String, default: '' },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
    leadLabel: { type: String, default: '' },
    // rule + lead + événement : rejouer le même événement n'exécute rien de plus.
    eventKey: { type: String, required: true },
    trigger: { type: String, required: true },
    status: { type: String, enum: RUN_STATUSES, required: true },
    steps: {
      type: [
        new mongoose.Schema(
          {
            action: String,
            status: { type: String, enum: ['OK', 'ERR', 'SKIP', 'PENDING'] },
            message: { type: String, default: '' },
            payload: { type: mongoose.Schema.Types.Mixed },
            at: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    depth: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

// Les simulations portent une clé propre : elles n'occupent jamais celle d'un vrai événement.
crmRuleRunSchema.index({ eventKey: 1 }, { unique: true })
crmRuleRunSchema.index({ rule: 1, lead: 1, createdAt: -1 })
crmRuleRunSchema.index({ createdAt: -1 })
crmRuleRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 })

export default mongoose.model<ICrmRuleRun>('CrmRuleRun', crmRuleRunSchema)
