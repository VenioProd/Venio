import mongoose from 'mongoose'
import type { IProjectItem } from '../types/models/index.js'

const projectItemSchema = new mongoose.Schema<IProjectItem>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    section: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectSection', default: null },
    type: {
      type: String,
      enum: [
        'LIVRABLE',
        'DEVIS',
        'FACTURE',
        'CONTRAT',
        'CAHIER_DES_CHARGES',
        'MAQUETTE',
        'DOCUMENTATION',
        'LIEN',
        'NOTE',
        'AUTRE',
      ],
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String, default: '' },

    // Pour les fichiers
    file: {
      originalName: { type: String },
      storagePath: { type: String },
      mimeType: { type: String },
      size: { type: Number },
    },

    // Pour les liens
    url: { type: String },

    // Pour les notes/texte
    content: { type: String },

    // Métadonnées
    order: { type: Number, default: 0 },
    isVisible: { type: Boolean, default: true }, // Contrôle de visibilité par l'admin
    isDownloadable: { type: Boolean, default: true }, // Le client peut-il télécharger ?

    // Statut pour les livrables
    status: {
      type: String,
      enum: ['EN_ATTENTE', 'EN_COURS', 'TERMINE', 'VALIDE'],
      default: 'EN_ATTENTE',
    },

    // Tracking
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    viewedAt: { type: Date, default: null },
    downloadedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// Index pour trier les items
projectItemSchema.index({ project: 1, section: 1, order: 1 })
projectItemSchema.index({ project: 1, type: 1 })

export default mongoose.model<IProjectItem>('ProjectItem', projectItemSchema)
