import mongoose, { Schema, Document } from 'mongoose'

export interface ITicketFile {
  filename: string
  originalName: string
  mimetype: string
  size: number
}

export interface ITicketReply {
  _id?: string
  authorId: mongoose.Types.ObjectId
  authorName: string
  message: string
  attachments: ITicketFile[]
  createdAt: Date
}

export interface IInternalTicket extends Document {
  title: string
  message: string
  category: 'QUESTION' | 'DEMANDE' | 'PROBLEME'
  priority: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
  status: 'OUVERT' | 'EN_COURS' | 'RESOLU' | 'FERME'
  authorId: mongoose.Types.ObjectId
  authorName: string
  attachments: ITicketFile[]
  replies: ITicketReply[]
  isArchived: boolean
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const fileSchema = new Schema<ITicketFile>(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false }
)

const replySchema = new Schema<ITicketReply>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    message: { type: String, required: true },
    attachments: { type: [fileSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

const internalTicketSchema = new Schema<IInternalTicket>(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true },
    category: { type: String, enum: ['QUESTION', 'DEMANDE', 'PROBLEME'], default: 'QUESTION' },
    priority: { type: String, enum: ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'], default: 'NORMALE' },
    status: { type: String, enum: ['OUVERT', 'EN_COURS', 'RESOLU', 'FERME'], default: 'OUVERT' },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    attachments: { type: [fileSchema], default: [] },
    replies: [replySchema],
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

export default mongoose.model<IInternalTicket>('InternalTicket', internalTicketSchema)
