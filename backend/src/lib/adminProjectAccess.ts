import User from '../models/User.js'
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

export async function readableProjectIds(user: AdminUser): Promise<string[] | null> {
  if (user.role !== 'COMMERCIAL') return null
  // Le statut en session ne suffit pas : un retrait doit s'appliquer dès la requête suivante.
  const account = await User.findById(user.id).select('isAssociate').lean()
  if (account?.isAssociate) return null
  const [accessible, clients] = await Promise.all([
    accessibleProjectIds(user),
    User.distinct('_id', { role: 'CLIENT', ownerAdminId: user.id }),
  ])
  const owned = await Project.distinct('_id', { client: { $in: clients } })
  return [...new Set([...(accessible ?? []), ...owned.map(String)])]
}

export async function canReadProject(user: AdminUser, projectId: string): Promise<boolean> {
  const ids = await readableProjectIds(user)
  return ids === null || ids.includes(projectId.toLowerCase())
}
