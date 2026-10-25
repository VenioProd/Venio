import type { ClientSession, Types } from 'mongoose'
import Project from '../models/Project.js'

export async function lockProject(projectId: string | Types.ObjectId, session: ClientSession): Promise<void> {
  const result = await Project.updateOne(
    { _id: projectId },
    { $inc: { writeVersion: 1 } },
    { session, timestamps: false },
  )
  if (result.matchedCount === 0) throw Object.assign(new Error('Projet non trouvé'), { status: 404 })
}
