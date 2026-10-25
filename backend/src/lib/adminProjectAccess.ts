import Project from '../models/Project.js'
import Task from '../models/Task.js'
import MissionBrief from '../models/MissionBrief.js'

type AdminUser = { id: string; role: string }

export async function accessibleProjectIds(user: AdminUser): Promise<string[] | null> {
  if (user.role === 'SUPER_ADMIN') return null
  const [tasks, briefs, assigned] = await Promise.all([
    Task.distinct('project', { assignee: user.id }),
    MissionBrief.distinct('project', { destinataire: user.id }),
    Project.distinct('_id', { assignedTo: user.id }),
  ])
  return [...new Set([...tasks, ...briefs, ...assigned].map(String))]
}

export async function hasProjectAccess(user: AdminUser, projectId: string): Promise<boolean> {
  const ids = await accessibleProjectIds(user)
  return ids === null || ids.includes(projectId.toLowerCase())
}
