import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireSuperAdmin } from '../../middleware/role.js'
import Subsidiary, { SUBSIDIARY_STATUSES, SUBSIDIARY_HEALTHS } from '../../models/Subsidiary.js'
import InternalProject, { ENTITIES } from '../../models/InternalProject.js'

const router = express.Router()
router.use(auth)
router.use(requireSuperAdmin)

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || 'filiale'
  let candidate = root
  let i = 1

  while (true) {
    const existing = await Subsidiary.findOne({ slug: candidate })
    if (!existing || (excludeId && String(existing._id) === excludeId)) return candidate
    candidate = `${root}-${++i}`
  }
}

const EDITABLE_FIELDS = [
  'name',
  'tagline',
  'sector',
  'status',
  'health',
  'description',
  'accentColor',
  'lead',
  'foundedYear',
  'linkedEntity',
  'team',
  'kpis',
  'objective',
  'links',
  'alerts',
  'tags',
  'order',
  'archived',
] as const

function applyFields(target: any, body: Record<string, any>): void {
  for (const key of EDITABLE_FIELDS) {
    if (body[key] === undefined) continue
    if (key === 'name') {
      target.name = String(body.name).trim()
      continue
    }
    target[key] = body[key]
  }
}

/** Agrège les projets internes liés à la filiale (champ entity == linkedEntity). */
async function aggregateProjects(linkedEntity: string) {
  if (!linkedEntity) return { projects: [], counts: { active: 0, total: 0 } }
  const projects = await InternalProject.find({ entity: linkedEntity })
    .select('name status priority updatedAt')
    .sort({ updatedAt: -1 })
    .limit(8)
    .lean()
  const total = await InternalProject.countDocuments({ entity: linkedEntity })
  const active = await InternalProject.countDocuments({ entity: linkedEntity, status: 'EN_COURS' })
  return { projects, counts: { active, total } }
}

// GET /meta — listes pour les formulaires (statuts, santé, entités liables)
router.get('/meta', (_req: Request, res: Response) => {
  res.json({ statuses: SUBSIDIARY_STATUSES, healths: SUBSIDIARY_HEALTHS, entities: ENTITIES })
})

// GET / — liste des filiales (vue annuaire) avec agrégats légers
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const includeArchived = req.query.archived === 'true'
    const filter: Record<string, any> = includeArchived ? {} : { archived: false }
    const subsidiaries = await Subsidiary.find(filter)
      .populate('lead', 'name email')
      .populate('team', 'name email')
      .sort({ order: 1, createdAt: 1 })
      .lean()

    const withCounts = await Promise.all(
      subsidiaries.map(async (s) => {
        const { counts } = await aggregateProjects(s.linkedEntity)
        const headcount = s.team?.length || 0 || s.kpis?.headcount || 0
        return { ...s, projectCounts: counts, headcount }
      }),
    )

    return res.json({ subsidiaries: withCounts })
  } catch (err) {
    return next(err)
  }
})

// GET /:id — fiche détaillée + agrégation projets internes
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subsidiary = await Subsidiary.findById(req.params.id)
      .populate('lead', 'name email')
      .populate('team', 'name email role')
      .lean()
    if (!subsidiary) return res.status(404).json({ error: 'Filiale introuvable' })

    const { projects, counts } = await aggregateProjects(subsidiary.linkedEntity)
    return res.json({ subsidiary: { ...subsidiary, linkedProjects: projects, projectCounts: counts } })
  } catch (err) {
    return next(err)
  }
})

// POST / — créer
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Le nom est requis' })

    const doc: any = { createdBy: req.user!.id, slug: await uniqueSlug(name) }
    applyFields(doc, req.body)

    const subsidiary = await Subsidiary.create(doc)
    const populated = await Subsidiary.findById(subsidiary._id)
      .populate('lead', 'name email')
      .populate('team', 'name email')
    return res.status(201).json({ subsidiary: populated })
  } catch (err) {
    return next(err)
  }
})

// PATCH /:id — mettre à jour
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subsidiary = await Subsidiary.findById(req.params.id)
    if (!subsidiary) return res.status(404).json({ error: 'Filiale introuvable' })

    applyFields(subsidiary, req.body)
    if (req.body.name !== undefined) {
      subsidiary.slug = await uniqueSlug(req.body.name, String(subsidiary._id))
    }
    await subsidiary.save()

    const populated = await Subsidiary.findById(subsidiary._id)
      .populate('lead', 'name email')
      .populate('team', 'name email role')
    return res.json({ subsidiary: populated })
  } catch (err) {
    return next(err)
  }
})

// DELETE /:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subsidiary = await Subsidiary.findById(req.params.id)
    if (!subsidiary) return res.status(404).json({ error: 'Filiale introuvable' })
    await subsidiary.deleteOne()
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

export default router
