import mongoose from 'mongoose'
import Project from '../models/Project.js'
import ProjectMember from '../models/ProjectMember.js'
import type { IProject } from '../types/models/index.js'

export type ProjectAccessRole = 'OWNER' | 'EDITOR' | 'VIEWER'

export interface ProjectAccess {
  project: IProject
  role: ProjectAccessRole
}

/**
 * Resolve project access for a browser client on every request. Membership
 * deletion therefore takes effect immediately; no role is cached in a session.
 * Returning null intentionally avoids exposing a project's existence.
 */
export async function getProjectAccess(projectId: string | string[], userId: string): Promise<ProjectAccess | null> {
  if (typeof projectId !== 'string' || !mongoose.isValidObjectId(projectId)) return null

  const project = await Project.findById(projectId)
  if (!project) return null
  if (String(project.client) === userId) return { project, role: 'OWNER' }

  const member = await ProjectMember.findOne({ project: project._id, user: userId }).select('role').lean()
  if (!member) return null
  return { project, role: member.role }
}

export function canEditProject(access: ProjectAccess): boolean {
  return access.role === 'OWNER' || access.role === 'EDITOR'
}

export function canManageProjectMembers(access: ProjectAccess): boolean {
  return access.role === 'OWNER'
}
