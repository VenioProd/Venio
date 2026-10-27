import type { IProject } from '../types/models/index.js'

export function clientBillingVisibility(userId: string, projects: Pick<IProject, '_id' | 'client'>[]) {
  return {
    $or: [
      { payer: null },
      {
        'payer.kind': 'CLIENT',
        $or: [
          { 'payer.user': userId },
          ...projects.map((project) => ({ project: project._id, 'payer.user': project.client })),
        ],
      },
    ],
  }
}
