import type { Document, Types } from 'mongoose'
import type { BriefEntity, BriefPriority, BriefStatus } from '../enums.js'

// ─── MissionBrief ───
export interface IBriefDateCle {
  label: string
  date: Date
}

export interface IMissionBrief extends Document {
  project: Types.ObjectId
  task: Types.ObjectId | null
  destinataire: Types.ObjectId
  entity: BriefEntity
  briefPriority: BriefPriority
  deadline: Date
  intitule: string
  contexte: string
  livrablesAttendus: string
  formatLivrable: string[]
  ressources: string
  pointsVigilance: string
  pointIntermediaire: Date | null
  validationPar: Types.ObjectId | null
  statut: BriefStatus
  datesCles: IBriefDateCle[]
  commentaires: string
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}
