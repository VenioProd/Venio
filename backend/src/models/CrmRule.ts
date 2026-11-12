import mongoose from 'mongoose'

export const RULE_TRIGGERS = [
  'LEAD_CREATED',
  'STATUS_CHANGED',
  'LEAD_ASSIGNED',
  'LEAD_INACTIVE',
  'ACTION_OVERDUE',
  'SCORE_AT_LEAST',
  'INTERACTION_LOGGED',
] as const
export type RuleTrigger = (typeof RULE_TRIGGERS)[number]

export const RULE_ACTIONS = [
  'CREATE_TASK',
  'NOTIFY',
  'ASSIGN',
  'SET_STATUS',
  'ADD_TAG',
  'SET_FIELD',
  'SEND_EMAIL',
  'CREATE_CLIENT',
  'CREATE_PROJECT',
  'ARCHIVE',
] as const
export type RuleActionType = (typeof RULE_ACTIONS)[number]

export const CONDITION_FIELDS = [
  'status',
  'project',
  'source',
  'budget',
  'probability',
  'leadTemperature',
  'score',
  'tags',
  'assignedTo',
  'externalRep',
  'daysSinceActivity',
  'daysInStage',
  'archived',
] as const
export const CONDITION_OPERATORS = [
  'eq',
  'neq',
  'in',
  'nin',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'empty',
  'notEmpty',
] as const

export interface IRuleCondition {
  field: (typeof CONDITION_FIELDS)[number]
  operator: (typeof CONDITION_OPERATORS)[number]
  value?: unknown
}
export interface IRuleAction {
  type: RuleActionType
  params: Record<string, unknown>
}
export interface ICrmRule extends mongoose.Document {
  name: string
  description: string
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED'
  system: boolean
  systemKey?: string
  trigger: { type: RuleTrigger; params: Record<string, unknown> }
  conditions: { op: 'AND' | 'OR'; items: IRuleCondition[] }
  actions: IRuleAction[]
  limits: { perLead: 'ONCE' | 'DAYS' | 'NONE'; days: number; maxPerRun: number }
  requireApproval: boolean
  createdBy: mongoose.Types.ObjectId | null
  stats: { runs: number; ok: number; errors: number; lastRunAt: Date | null }
  createdAt: Date
  updatedAt: Date
}

const crmRuleSchema = new mongoose.Schema<ICrmRule>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: ['DRAFT', 'ACTIVE', 'PAUSED'], default: 'DRAFT' },
    system: { type: Boolean, default: false },
    systemKey: { type: String },
    trigger: {
      type: new mongoose.Schema(
        {
          type: { type: String, enum: RULE_TRIGGERS, required: true },
          params: { type: mongoose.Schema.Types.Mixed, default: {} },
        },
        { _id: false },
      ),
      required: true,
    },
    conditions: {
      type: new mongoose.Schema(
        {
          op: { type: String, enum: ['AND', 'OR'], default: 'AND' },
          items: {
            type: [
              new mongoose.Schema(
                {
                  field: { type: String, enum: CONDITION_FIELDS, required: true },
                  operator: { type: String, enum: CONDITION_OPERATORS, required: true },
                  value: { type: mongoose.Schema.Types.Mixed },
                },
                { _id: false },
              ),
            ],
            default: [],
          },
        },
        { _id: false },
      ),
      default: () => ({ op: 'AND', items: [] }),
    },
    actions: {
      type: [
        new mongoose.Schema(
          {
            type: { type: String, enum: RULE_ACTIONS, required: true },
            params: { type: mongoose.Schema.Types.Mixed, default: {} },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    limits: {
      type: new mongoose.Schema(
        {
          perLead: { type: String, enum: ['ONCE', 'DAYS', 'NONE'], default: 'DAYS' },
          days: { type: Number, default: 7, min: 1, max: 365 },
          maxPerRun: { type: Number, default: 50, min: 1, max: 500 },
        },
        { _id: false },
      ),
      default: () => ({ perLead: 'DAYS', days: 7, maxPerRun: 50 }),
    },
    // Tout e-mail sortant attend une validation humaine tant que ce drapeau est vrai.
    requireApproval: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    stats: {
      type: new mongoose.Schema(
        {
          runs: { type: Number, default: 0 },
          ok: { type: Number, default: 0 },
          errors: { type: Number, default: 0 },
          lastRunAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: () => ({ runs: 0, ok: 0, errors: 0, lastRunAt: null }),
    },
  },
  { timestamps: true },
)

crmRuleSchema.index({ status: 1, 'trigger.type': 1 })
crmRuleSchema.index({ systemKey: 1 }, { unique: true, sparse: true })

export default mongoose.model<ICrmRule>('CrmRule', crmRuleSchema)
