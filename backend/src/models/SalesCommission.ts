import mongoose from 'mongoose'
import type { ISalesCommission } from '../types/models/index.js'

/**
 * Commission d'un commercial externe sur un mouvement d'encaissement. Une ligne
 * par ProjectPayment : l'index unique sur `payment` rend le calcul rejouable
 * (webhook Stripe reçu deux fois, retry). Un remboursement porte une ligne
 * négative ; le dû d'un commercial est la somme de ses lignes DUE.
 */
const salesCommissionSchema = new mongoose.Schema<ISalesCommission>(
  {
    rep: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingDocument', required: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectPayment', required: true },
    kind: { type: String, enum: ['PAYMENT', 'REFUND'], required: true },
    baseHtCents: { type: Number, required: true, validate: Number.isSafeInteger },
    rateBp: { type: Number, required: true, min: 0, max: 10000 },
    amountCents: { type: Number, required: true, validate: Number.isSafeInteger },
    receivedAt: { type: Date, required: true },
    status: { type: String, enum: ['DUE', 'PAID'], default: 'DUE' },
    paidAt: { type: Date, default: null },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

salesCommissionSchema.index({ payment: 1 }, { unique: true })
salesCommissionSchema.index({ rep: 1, status: 1, receivedAt: -1 })
salesCommissionSchema.index({ invoice: 1 })

export default mongoose.model<ISalesCommission>('SalesCommission', salesCommissionSchema)
