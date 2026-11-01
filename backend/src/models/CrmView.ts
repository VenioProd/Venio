import mongoose from 'mongoose'

export const CRM_VIEW_MODES = ['table', 'kanban'] as const
export const CRM_VIEW_SCOPES = ['PRIVATE', 'TEAM'] as const

export interface ICrmView extends mongoose.Document {
  name: string
  owner: mongoose.Types.ObjectId
  scope: (typeof CRM_VIEW_SCOPES)[number]
  filters: Record<string, unknown>
  columns: string[]
  sort: { key: string; dir: 1 | -1 } | null
  mode: (typeof CRM_VIEW_MODES)[number]
  pinned: boolean
  createdAt: Date
  updatedAt: Date
}

/** Vue enregistrée du pipeline : filtres, colonnes, tri et mode d'affichage. */
const crmViewSchema = new mongoose.Schema<ICrmView>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    scope: { type: String, enum: CRM_VIEW_SCOPES, default: 'PRIVATE' },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    columns: { type: [String], default: [] },
    sort: {
      type: new mongoose.Schema({ key: { type: String, required: true }, dir: { type: Number, enum: [1, -1], required: true } }, { _id: false }),
      default: null,
    },
    mode: { type: String, enum: CRM_VIEW_MODES, default: 'table' },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true },
)

crmViewSchema.index({ owner: 1, name: 1 }, { unique: true })
crmViewSchema.index({ scope: 1 })

export default mongoose.model<ICrmView>('CrmView', crmViewSchema)
