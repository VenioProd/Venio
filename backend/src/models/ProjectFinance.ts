import mongoose from 'mongoose'
import type {
  IProjectFinance,
  IFinanceInstallment,
  IFinanceSubscription,
  IFinancePayer,
} from '../types/models/index.js'
import { assertBp, assertCents } from '../lib/projectFinance/money.js'

const bpValidator = (value: number) => {
  assertBp(value)
  return true
}
const centsValidator = (value: number | null) => {
  if (value !== null) assertCents(value)
  return true
}
const installmentSchema = new mongoose.Schema<IFinanceInstallment>({
  label: { type: String, required: true, trim: true },
  percentBp: { type: Number, required: true, validate: bpValidator },
  trigger: {
    kind: { type: String, enum: ['DATE', 'MILESTONE'], required: true },
    dueDate: { type: Date, default: null },
    phase: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectPhase', default: null },
  },
})
const subscriptionSchema = new mongoose.Schema<IFinanceSubscription>(
  {
    amountHtCents: { type: Number, required: true, min: 1, validate: centsValidator },
    period: { type: String, enum: ['MONTHLY', 'QUARTERLY', 'YEARLY'], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
  },
  { _id: false },
)
const payerSchema = new mongoose.Schema<IFinancePayer>({
  kind: { type: String, enum: ['CLIENT', 'SUBSIDIARY', 'THIRD_PARTY'], required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  subsidiary: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsidiary', default: null },
  shareBp: { type: Number, required: true, validate: bpValidator },
  isPrincipal: { type: Boolean, default: false },
  billingContact: {
    name: { type: String, trim: true },
    addressLine1: String,
    addressLine2: String,
    postalCode: String,
    city: String,
    country: String,
    email: String,
    siret: String,
    vatNumber: String,
  },
  paymentMethod: { type: String, enum: ['VIREMENT', 'CB', 'PRELEVEMENT', 'STRIPE'], required: true },
})
const projectFinanceSchema = new mongoose.Schema<IProjectFinance>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, unique: true },
    mode: { type: String, enum: ['FORFAIT', 'ECHEANCIER', 'ABONNEMENT'], required: true },
    contractHtCents: {
      type: Number,
      default: null,
      min: 1,
      validate: centsValidator,
      required: function (this: IProjectFinance): boolean {
        return this.mode !== 'ABONNEMENT'
      },
    },
    vatRateBp: { type: Number, default: 2000, required: true, validate: bpValidator },
    installments: { type: [installmentSchema], default: [] },
    subscription: { type: subscriptionSchema, default: null },
    payers: { type: [payerSchema], default: [] },
    shareActivationDate: { type: Date, default: null },
  },
  { timestamps: true },
)

export default mongoose.model<IProjectFinance>('ProjectFinance', projectFinanceSchema)
