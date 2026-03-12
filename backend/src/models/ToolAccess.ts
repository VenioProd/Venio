import mongoose, { Schema, Document } from 'mongoose'

export interface IToolAccess extends Document {
  name: string
  url: string
  login: string
  password: string
  category: 'IA' | 'DESIGN' | 'DEV' | 'MARKETING' | 'COMMUNICATION' | 'GESTION' | 'AUTRE'
  notes: string
  addedBy: mongoose.Types.ObjectId
  addedByName: string
  createdAt: Date
  updatedAt: Date
}

const toolAccessSchema = new Schema<IToolAccess>(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, default: '', trim: true },
    login: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    category: {
      type: String,
      enum: ['IA', 'DESIGN', 'DEV', 'MARKETING', 'COMMUNICATION', 'GESTION', 'AUTRE'],
      default: 'AUTRE',
    },
    notes: { type: String, default: '' },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    addedByName: { type: String, required: true },
  },
  { timestamps: true }
)

toolAccessSchema.index({ name: 1 })

export default mongoose.model<IToolAccess>('ToolAccess', toolAccessSchema)
