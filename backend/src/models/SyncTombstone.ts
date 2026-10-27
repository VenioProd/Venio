import mongoose from 'mongoose'

export const SYNC_ENTITY_TYPES = [
  'leads',
  'interactions',
  'projects',
  'projectPhases',
  'projectUpdates',
  'projectDocuments',
  'quotes',
] as const
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number]
export const SYNC_RETENTION_MS = 90 * 86400000

const schema = new mongoose.Schema({
  entityType: { type: String, enum: SYNC_ENTITY_TYPES, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  deletedAt: { type: Date, required: true, default: Date.now },
})
schema.index({ deletedAt: 1 }, { expireAfterSeconds: SYNC_RETENTION_MS / 1000 })
schema.index({ deletedAt: 1, _id: 1 })

export default mongoose.model('SyncTombstone', schema)
