import mongoose from 'mongoose'
import type { IDocument } from '../types/models/index.js'

const documentSchema = new mongoose.Schema<IDocument>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    type: {
      type: String,
      enum: ['DEVIS', 'FACTURE', 'FICHIER_PROJET'],
      required: true,
    },
    originalName: { type: String, required: true },
    storagePath: { type: String, required: true },
    mimeType: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now },
    downloadedAt: { type: Date, default: null },
  },
  { timestamps: false }
)

documentSchema.index({ project: 1, uploadedAt: -1 })

export default mongoose.model<IDocument>('Document', documentSchema)
