import type { Schema, Types } from 'mongoose'
import SyncTombstone, { type SyncEntityType } from '../models/SyncTombstone.js'

export function syncTombstones<T>(schema: Schema<T>, entityType: SyncEntityType) {
  const pending = new WeakMap<object, Types.ObjectId[]>()
  schema.index({ updatedAt: 1, _id: 1 })
  for (const operation of ['deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
    schema.pre(operation, { query: true, document: false }, async function () {
      const query = this.model
        .find(this.getFilter())
        .select('_id')
        .session(this.getOptions().session ?? null)
      if (operation !== 'deleteMany') query.limit(1)
      if (this.getOptions().sort) query.sort(this.getOptions().sort)
      const documents = await query.lean()
      pending.set(
        this,
        documents.map((document) => document._id as Types.ObjectId),
      )
    })
  }
  schema.post(
    ['deleteOne', 'deleteMany', 'findOneAndDelete'],
    { query: true, document: false },
    async function (result) {
      const ids = pending.get(this) ?? []
      pending.delete(this)
      if (!result || ('deletedCount' in result && result.deletedCount === 0) || ids.length === 0) return
      await SyncTombstone.insertMany(
        ids.map((entityId) => ({ entityType, entityId, deletedAt: new Date() })),
        {
          session: this.getOptions().session,
        },
      )
    },
  )
}
