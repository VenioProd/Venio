import Lead from '../models/Lead.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import { createFolder, isNextcloudEnabled } from './nextcloud.js'

export const HOT_TEMPERATURES = ['TRES_CHAUD', 'CHAUD'] as const
const closedIssues = ['DONE', 'CANCELLED', 'DUPLICATE']

export async function subsidiaryCrm(leadProject: string, details = true) {
  const indicators = { signedClients: 0, hotProspects: 0, weightedPipeline: null, estimatedMrr: null }
  if (!leadProject) return { indicators, hotProspects: [], signedClients: [] }
  if (!details) {
    const [hotProspects, signedClients] = await Promise.all([
      Lead.countDocuments({
        project: leadProject,
        status: { $nin: ['WON', 'LOST'] },
        leadTemperature: { $in: HOT_TEMPERATURES },
      }),
      Lead.countDocuments({ project: leadProject, status: 'WON' }),
    ])
    return { indicators: { ...indicators, signedClients, hotProspects }, hotProspects: [], signedClients: [] }
  }
  const [hot, won] = await Promise.all([
    Lead.find({ project: leadProject, status: { $nin: ['WON', 'LOST'] }, leadTemperature: { $in: HOT_TEMPERATURES } })
      .select('company contactName status budget nextActionAt assignedTo leadTemperature score serviceType')
      .populate('assignedTo', 'name email')
      .lean(),
    Lead.find({ project: leadProject, status: 'WON' })
      .select('company contactName budget serviceType statusChangedAt clientAccountId')
      .populate('clientAccountId', 'name email company')
      .sort({ statusChangedAt: -1, _id: 1 })
      .lean(),
  ])
  const rank = (temperature: string | undefined) => (temperature === 'TRES_CHAUD' ? 2 : 1)
  hot.sort(
    (a, b) =>
      rank(b.leadTemperature) - rank(a.leadTemperature) ||
      (b.score ?? -1) - (a.score ?? -1) ||
      String(a._id).localeCompare(String(b._id)),
  )
  const leadLink = (id: unknown) => `/admin/crm/leads/${id}`
  return {
    indicators: { ...indicators, signedClients: won.length, hotProspects: hot.length },
    hotProspects: details ? hot.map((l) => ({ ...l, href: leadLink(l._id) })) : [],
    signedClients: details
      ? won.map((l) => ({
          ...l,
          signedAt: l.statusChangedAt ?? null,
          href: leadLink(l._id),
          clientHref: l.clientAccountId
            ? `/admin/comptes-clients/${(l.clientAccountId as unknown as { _id: unknown })._id}`
            : null,
        }))
      : [],
  }
}

export async function subsidiaryDev(projectId: unknown) {
  if (!projectId) return null
  const project = await DevProject.findById(projectId).select('key name').lean()
  if (!project) return null
  const filter = { project: project._id, archivedAt: null }
  const [open, inProgress, done, issues] = await Promise.all([
    DevIssue.countDocuments({ ...filter, status: { $nin: closedIssues } }),
    DevIssue.countDocuments({ ...filter, status: { $in: ['IN_PROGRESS', 'IN_REVIEW'] } }),
    DevIssue.countDocuments({ ...filter, status: 'DONE' }),
    DevIssue.find({ ...filter, status: { $nin: closedIssues } })
      .select('identifier title status priority updatedAt')
      .sort({ createdAt: -1, _id: -1 })
      .limit(5)
      .lean(),
  ])
  return {
    ...project,
    href: `/admin/dev?project=${project._id}`,
    counts: { open, inProgress, done },
    issues: issues.map((issue) => ({ ...issue, href: `/admin/dev/issues/${issue._id}` })),
  }
}

export async function provisionSubsidiaryCloud(name: string, existingPath?: string) {
  if (!isNextcloudEnabled())
    throw Object.assign(new Error('Nextcloud non configuré. Vous pouvez saisir le lien du dossier manuellement.'), {
      status: 503,
      code: 'NEXTCLOUD_NOT_CONFIGURED',
    })
  const safeName = name
    .trim()
    .replace(/[/\\<>:"|?*]/g, '-')
    .replace(/\.\./g, '')
    .trim()
  const path = existingPath || `/Plateformes/${safeName || 'Plateforme'}`
  const parents = path.split('/').filter(Boolean)
  const paths = parents.map((_, i) => '/' + parents.slice(0, i + 1).join('/'))
  for (const folder of [...paths, ...['Commercial', 'Juridique', 'Produit', 'Marketing'].map((f) => `${path}/${f}`)]) {
    const result = await createFolder(folder)
    if (!result.success && !result.alreadyExists)
      throw Object.assign(
        new Error('Impossible de créer le dossier Nextcloud. Réessayez ou renseignez son lien manuellement.'),
        { status: 502, code: 'NEXTCLOUD_FOLDER_FAILED' },
      )
  }
  return {
    path,
    url: `${(process.env.NEXTCLOUD_URL || '').replace(/\/$/, '')}/apps/files/?dir=${encodeURIComponent(path)}`,
  }
}
