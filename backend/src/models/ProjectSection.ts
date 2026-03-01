import mongoose from 'mongoose'
import type { IProjectSection } from '../types/models.js'

const projectSectionSchema = new mongoose.Schema<IProjectSection>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    order: { type: Number, default: 0 },
    isVisible: { type: Boolean, default: true }, // Contrôle de visibilité par l'admin
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

// Index pour trier les sections par ordre
projectSectionSchema.index({ project: 1, order: 1 })

export default mongoose.model<IProjectSection>('ProjectSection', projectSectionSchema)
