import mongoose, { Schema, Document } from 'mongoose'

export type DecisionStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type DecisionPriority = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
export type DecisionCategory = 'BUDGET' | 'EMBAUCHE' | 'PROJET' | 'PARTENARIAT' | 'AUTRE'

export interface IDecisionAttachment {
  originalName: string
  storagePath: string
  mimeType: string
  size: number
}

export interface IDecision extends Document {
  title: string
  description: string
  category: DecisionCategory
  priority: DecisionPriority
  status: DecisionStatus
  submittedBy: mongoose.Types.ObjectId
  submittedByName: string
  decidedBy: mongoose.Types.ObjectId | null
  decidedByName: string | null
  decisionComment: string | null
  decidedAt: Date | null
  context: string | null
  options: string[]
  recommendation: string | null
  deadline: Date | null
  attachments: IDecisionAttachment[]
  recipients: mongoose.Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

const decisionSchema = new Schema<IDecision>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ['BUDGET', 'EMBAUCHE', 'PROJET', 'PARTENARIAT', 'AUTRE'],
      default: 'AUTRE',
    },
    priority: {
      type: String,
      enum: ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'],
      default: 'NORMALE',
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    submittedByName: { type: String, required: true },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    decidedByName: { type: String, default: null },
    decisionComment: { type: String, default: null },
    decidedAt: { type: Date, default: null },
    context: { type: String, default: null },
    options: { type: [String], default: [] },
    recommendation: { type: String, default: null },
    deadline: { type: Date, default: null },
    attachments: {
      type: [
        {
          originalName: { type: String, required: true },
          storagePath: { type: String, required: true },
          mimeType: { type: String, default: '' },
          size: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    recipients: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }],
  },
  { timestamps: true }
)

decisionSchema.index({ status: 1, priority: -1, createdAt: -1 })

export default mongoose.model<IDecision>('Decision', decisionSchema)
