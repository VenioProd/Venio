import mongoose, { type Types } from 'mongoose'

/**
 * Texte d'un script d'appel : un par étiquette de `CrmSettings.callScriptTags`
 * (index unique), en texte brut. Pas d'historique : une écriture remplace la précédente.
 */
export const CALL_SCRIPT_TITLE_MAX = 120
export const CALL_SCRIPT_BODY_MAX = 5000

export interface ICallScript {
  _id: Types.ObjectId
  tag: string
  title: string
  body: string
  updatedBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const callScriptSchema = new mongoose.Schema<ICallScript>(
  {
    tag: { type: String, required: true, trim: true, maxlength: 60 },
    title: { type: String, required: true, trim: true, maxlength: CALL_SCRIPT_TITLE_MAX },
    body: { type: String, required: true, maxlength: CALL_SCRIPT_BODY_MAX },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

callScriptSchema.index({ tag: 1 }, { unique: true })

export default mongoose.model<ICallScript>('CallScript', callScriptSchema)
