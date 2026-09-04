import mongoose, { Schema, Document } from 'mongoose'

export interface IBetaTester extends Document {
  _id: mongoose.Types.ObjectId
  campaign: mongoose.Types.ObjectId
  // Renseigné quand un membre de l'équipe s'est déclaré testeur lui-même :
  // il garde son compte, et son passage se lit comme celui d'un interne.
  user: mongoose.Types.ObjectId | null
  name: string
  email: string
  // Empreinte SHA-256 du secret porté par le lien. Le secret lui-même n'est
  // montré qu'une fois, à la création, et n'est jamais persisté.
  tokenHash: string
  invitedAt: Date
  lastSeenAt: Date | null
  revokedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const betaTesterSchema = new Schema<IBetaTester>(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'BetaCampaign', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    tokenHash: { type: String, required: true, index: true },
    invitedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
)

betaTesterSchema.index({ campaign: 1, email: 1 }, { unique: true })

export default mongoose.model<IBetaTester>('BetaTester', betaTesterSchema)
