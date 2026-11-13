import mongoose, { Schema, type Types } from 'mongoose'

/**
 * Préférences d'appel d'un utilisateur (lot P) : le mode pont, où Twilio appelle
 * d'abord son portable puis le prospect. Le portable n'est utilisé qu'une fois
 * vérifié par un code lu au téléphone ; le navigateur n'envoie jamais de numéro
 * au moment d'appeler.
 */
export interface ICallerProfile {
  /** L'utilisateur. */
  _id: Types.ObjectId
  bridge: { enabled: boolean; phone: string | null; verifiedAt: Date | null }
  /** Vérification en cours : code haché, échéance, essais ; envois récents pour le plafond. */
  verification: { phone: string; codeHash: string; expiresAt: Date; attempts: number } | null
  codeSentAt: Date[]
}

const callerProfileSchema = new Schema<ICallerProfile>(
  {
    _id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bridge: {
      enabled: { type: Boolean, default: false },
      phone: { type: String, default: null },
      verifiedAt: { type: Date, default: null },
    },
    verification: {
      type: new Schema(
        {
          phone: { type: String, required: true },
          codeHash: { type: String, required: true },
          expiresAt: { type: Date, required: true },
          attempts: { type: Number, default: 0 },
        },
        { _id: false },
      ),
      default: null,
    },
    codeSentAt: { type: [Date], default: [] },
  },
  { timestamps: true },
)

export default mongoose.model<ICallerProfile>('CallerProfile', callerProfileSchema)
