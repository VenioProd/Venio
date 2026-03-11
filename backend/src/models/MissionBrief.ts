import mongoose, { Schema } from 'mongoose'
import type { IMissionBrief } from '../types/models.js'

const dateCleSchema = new Schema(
  {
    label: { type: String, required: true },
    date: { type: Date, required: true },
  },
  { _id: false }
)

const missionBriefSchema = new Schema<IMissionBrief>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    destinataire: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    entity: {
      type: String,
      enum: ['VENIO', 'CREATIO', 'DECISIO', 'FORMATIO'],
      default: 'VENIO',
    },
    briefPriority: {
      type: String,
      enum: ['P1', 'P2', 'P3'],
      default: 'P2',
    },
    deadline: { type: Date, required: true },
    intitule: { type: String, required: true, trim: true },
    contexte: { type: String, default: '' },
    livrablesAttendus: { type: String, default: '' },
    formatLivrable: [{ type: String, enum: ['PDF', 'PPT', 'FIGMA', 'VIDEO', 'WEB', 'AUTRE'] }],
    ressources: { type: String, default: '' },
    pointsVigilance: { type: String, default: '' },
    pointIntermediaire: { type: Date, default: null },
    validationPar: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    statut: {
      type: String,
      enum: ['A_FAIRE', 'EN_COURS', 'EN_REVIEW', 'VALIDE', 'LIVRE', 'NON_VALIDE', 'A_AMELIORER'],
      default: 'A_FAIRE',
    },
    datesCles: { type: [dateCleSchema], default: [] },
    commentaires: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

missionBriefSchema.index({ project: 1 })
missionBriefSchema.index({ destinataire: 1 })

export default mongoose.model<IMissionBrief>('MissionBrief', missionBriefSchema)
