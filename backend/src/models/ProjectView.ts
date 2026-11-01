import mongoose from 'mongoose'

/**
 * Vue sauvegardée de la liste Projets : un jeu de filtres nommé.
 * `shared` la rend visible de tous les admins (et des agents API) ; sinon
 * elle reste celle de son propriétaire.
 */
const projectViewSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    shared: { type: Boolean, default: false },
    filters: {
      status: { type: String, default: '' },
      assignedTo: { type: String, default: '' },
      priority: { type: String, default: '' },
      risk: { type: Boolean, default: false },
      late: { type: Boolean, default: false },
      toBill: { type: Boolean, default: false },
      mine: { type: Boolean, default: false },
      q: { type: String, default: '', maxlength: 120 },
      sort: { type: String, default: 'urgency' },
    },
  },
  { timestamps: true },
)

projectViewSchema.index({ owner: 1, shared: 1 })

export default mongoose.model('ProjectView', projectViewSchema)
