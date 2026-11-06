import mongoose from 'mongoose'
import { GROUP_ENTITIES } from '../lib/groupEntities.js'

export interface ICrmGoal extends mongoose.Document {
  /** Mois visé, 'YYYY-MM' (Europe/Paris). */
  period: string
  /** Entité du groupe visée ; `null` : objectif commun à tout le groupe. */
  entity: (typeof GROUP_ENTITIES)[number] | null
  /** Commercial visé ; `null` : objectif d'équipe. */
  userId: mongoose.Types.ObjectId | null
  /** Chiffre d'affaires gagné visé (EUR, budget des leads WON). */
  amountTarget: number
  /** Nombre de leads gagnés visé. */
  wonCountTarget: number
  createdBy: mongoose.Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Objectif commercial mensuel. Un objectif porte sur un périmètre exact
 * (entité × commercial, chacun optionnel) : il n'est jamais déduit d'un autre.
 * Un seul objectif par (mois, entité, commercial).
 */
const crmGoalSchema = new mongoose.Schema<ICrmGoal>(
  {
    period: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    entity: { type: String, enum: [...GROUP_ENTITIES], default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    amountTarget: { type: Number, required: true, min: 0, default: 0 },
    wonCountTarget: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

crmGoalSchema.index({ period: 1, entity: 1, userId: 1 }, { unique: true })

export default mongoose.model<ICrmGoal>('CrmGoal', crmGoalSchema)
