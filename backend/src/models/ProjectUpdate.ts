import { syncTombstones } from '../lib/syncTombstones.js'
import mongoose from 'mongoose'
import type { IProjectUpdate } from '../types/models/index.js'

const projectUpdateSchema = new mongoose.Schema<IProjectUpdate>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

syncTombstones(projectUpdateSchema, 'projectUpdates')

export default mongoose.model<IProjectUpdate>('ProjectUpdate', projectUpdateSchema)
