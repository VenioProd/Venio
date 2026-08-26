import mongoose from 'mongoose'
import type { IClientUpload } from '../types/models/index.js'

const clientUploadSchema = new mongoose.Schema<IClientUpload>(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    category: {
      type: String,
      enum: ['LOGO', 'TEXTE', 'PHOTO', 'BRIEF', 'AUTRE'],
      default: 'AUTRE',
    },
    note: { type: String, default: '' },
    originalName: { type: String, required: true },
    storagePath: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    downloadedByAdminAt: { type: Date, default: null },
  },
  { timestamps: true },
)

clientUploadSchema.index({ client: 1, createdAt: -1 })
clientUploadSchema.index({ project: 1, createdAt: -1 })

export default mongoose.model<IClientUpload>('ClientUpload', clientUploadSchema)
