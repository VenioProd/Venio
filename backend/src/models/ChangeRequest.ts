import mongoose, { Schema, Document } from 'mongoose'

export interface IChangeRequestFile {
  filename: string
  originalName: string
  mimetype: string
  size: number
}

export interface IChangeRequestReply {
  _id?: string
  authorId: mongoose.Types.ObjectId
  authorName: string
  message: string
  attachments: IChangeRequestFile[]
  createdAt: Date
}

export interface IChangeRequestStatusEntry {
  status: string
  at: Date
  byUserId: mongoose.Types.ObjectId
  byName: string
  note: string
}

export interface IChangeRequest extends Document {
  client: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId | null
  title: string
  description: string
  pageUrl: string
  priority: 'BASSE' | 'NORMALE' | 'HAUTE'
  status: 'SOUMISE' | 'A_CHIFFRER' | 'PLANIFIEE' | 'EN_COURS' | 'LIVREE' | 'VALIDEE' | 'REFUSEE'
  qualification: 'INCLUSE' | 'A_CHIFFRER' | null
  refusalReason: string
  quoteProposal: mongoose.Types.ObjectId | null
  createdBy: mongoose.Types.ObjectId
  createdByName: string
  attachments: IChangeRequestFile[]
  replies: IChangeRequestReply[]
  statusHistory: IChangeRequestStatusEntry[]
  deliveredAt: Date | null
  validatedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const fileSchema = new Schema<IChangeRequestFile>(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false },
)

const replySchema = new Schema<IChangeRequestReply>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    message: { type: String, required: true },
    attachments: { type: [fileSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

const statusHistorySchema = new Schema<IChangeRequestStatusEntry>(
  {
    status: { type: String, required: true },
    at: { type: Date, required: true },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    byName: { type: String, required: true },
    note: { type: String, default: '' },
  },
  { _id: false },
)

const changeRequestSchema = new Schema<IChangeRequest>(
  {
    // Rattachement au COMPTE client (User rôle CLIENT). Toujours renseigné :
    // une demande survit à la fin d'un projet (site livré en maintenance).
    client: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null },

    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    pageUrl: { type: String, default: '', trim: true },

    // Priorité PERÇUE par le client — informative, pas un SLA.
    priority: { type: String, enum: ['BASSE', 'NORMALE', 'HAUTE'], default: 'NORMALE' },

    status: {
      type: String,
      enum: ['SOUMISE', 'A_CHIFFRER', 'PLANIFIEE', 'EN_COURS', 'LIVREE', 'VALIDEE', 'REFUSEE'],
      default: 'SOUMISE',
    },
    // « Incluse » n'est pas un statut : la demande incluse passe directement en
    // PLANIFIEE. Ce champ garde la mémoire de la décision pour l'UI et les KPI.
    qualification: { type: String, enum: ['INCLUSE', 'A_CHIFFRER'], default: null },
    refusalReason: { type: String, default: '' },

    // Lien unidirectionnel : QuoteProposal n'est pas modifié, le hook de
    // signature retrouve la demande par ce champ.
    quoteProposal: { type: Schema.Types.ObjectId, ref: 'QuoteProposal', default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, required: true },

    attachments: { type: [fileSchema], default: [] },
    replies: [replySchema],

    statusHistory: { type: [statusHistorySchema], default: [] },
    deliveredAt: { type: Date, default: null },
    validatedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

changeRequestSchema.index({ client: 1, status: 1, createdAt: -1 })
changeRequestSchema.index({ status: 1, createdAt: -1 })
changeRequestSchema.index({ project: 1 })
changeRequestSchema.index({ quoteProposal: 1 })

export default mongoose.model<IChangeRequest>('ChangeRequest', changeRequestSchema)
