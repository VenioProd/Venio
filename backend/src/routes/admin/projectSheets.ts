import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import auth from '../../middleware/auth.js'
import { requireAdmin, userHasPermission } from '../../middleware/role.js'
import ProjectSheet, {
  PROJECT_SHEET_LINK_TYPES,
  PROJECT_SHEET_REVIEW_STATUSES,
  PROJECT_SHEET_SECTIONS,
  PROJECT_SHEET_STATUSES,
} from '../../models/ProjectSheet.js'
import User from '../../models/User.js'
import DevProject from '../../models/DevProject.js'
import Subsidiary from '../../models/Subsidiary.js'
import { LEAD_PROJECTS } from '../../models/Lead.js'
import { GROUP_ENTITIES } from '../../lib/groupEntities.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { encryptSecret, decryptSecret } from '../../lib/secretBox.js'
import { buildActorFromReq, recordAudit } from '../../lib/audit/auditHelpers.js'
import {
  ADMIN_ROLES,
  DEMO_ACCESS_HISTORY_SUMMARY,
  SheetInputError,
  canEditSheets,
  canRevealDemoAccess,
  changedFields,
  historyEntry,
  pickSheetInput,
  publicDemoAccesses,
  pushHistory,
  searchSheets,
  serializeSheet,
  serializeSheetCard,
  sheetCrmSummary,
  slugify,
} from '../../lib/projectSheets.js'

/**
 * Fiches projets — /api/admin/project-sheets.
 * Lecture : rôles admin (requireAdmin, MFA comprise). Écriture : SUPER_ADMIN, ADMIN.
 * Voir docs/PROJECT_SHEETS.md.
 */
const router = express.Router()
router.use(auth)
router.use(requireAdmin)

const PASSWORD_FIELD = '+demoAccesses.passwordEnc'

function requireEditor(req: Request, res: Response, next: NextFunction): void {
  if (!canEditSheets(req.user?.role)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

function fail(err: unknown, res: Response, next: NextFunction) {
  const e = err as Error & { status?: number; code?: number }
  if (err instanceof SheetInputError) return res.status(400).json({ error: e.message })
  if (e.name === 'ValidationError' || e.name === 'CastError') return res.status(400).json({ error: e.message })
  if (e.code === 11000)
    return res.status(409).json({ error: 'Cette filiale a déjà une fiche.', code: 'SHEET_DUPLICATE' })
  return next(err)
}

function sheetLookup(param: unknown) {
  const idOrSlug = String(param ?? '')
  return mongoose.isValidObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug.toLowerCase() }
}

async function uniqueSlug(name: string): Promise<string> {
  const root = slugify(name) || 'fiche'
  let candidate = root
  for (let i = 2; await ProjectSheet.exists({ slug: candidate }); i++) candidate = `${root}-${i}`
  return candidate
}

/** Vérifie les références (membres internes, projet dev, filiale). */
async function checkReferences(input: Record<string, unknown>, role: string): Promise<void> {
  const userIds = [
    ...(input.referent ? [input.referent] : []),
    ...(Array.isArray(input.team) ? input.team.map((m) => (m as { user: unknown }).user) : []),
  ]
  if (userIds.length) {
    const unique = [...new Set(userIds.map(String))]
    const found = await User.countDocuments({ _id: { $in: unique }, role: { $in: ADMIN_ROLES } })
    if (found !== unique.length) throw new SheetInputError('Référent et équipe : uniquement des membres internes.')
  }
  if (input.devProject && !(await DevProject.exists({ _id: input.devProject })))
    throw new SheetInputError('Projet du dev tracker introuvable.')
  if (input.subsidiary !== undefined) {
    if (role !== 'SUPER_ADMIN') throw new SheetInputError('Seul un SUPER_ADMIN peut relier une filiale.')
    if (input.subsidiary && !(await Subsidiary.exists({ _id: input.subsidiary })))
      throw new SheetInputError('Filiale introuvable.')
  }
}

async function loadDetail(filter: Record<string, unknown>) {
  return ProjectSheet.findOne(filter)
    .populate('referent', 'name email')
    .populate('team.user', 'name email role')
    .populate('devProject', 'key name')
    .populate('history.by', 'name')
    .lean()
}

async function detailPayload(req: Request, filter: Record<string, unknown>) {
  const sheet = await loadDetail(filter)
  if (!sheet) return null
  const crm = (await userHasPermission(req, PERMISSIONS.VIEW_CRM))
    ? await sheetCrmSummary(sheet.legalEntity, sheet.leadProject)
    : null
  return serializeSheet(sheet, { role: req.user!.role }, { crm })
}

function auditSheet(
  req: Request,
  action: Parameters<typeof recordAudit>[0]['action'],
  sheet: { _id: unknown; slug: string },
  summary: string,
  extra: Record<string, unknown> = {},
) {
  return recordAudit({
    action,
    actor: buildActorFromReq(req),
    entityType: 'ProjectSheet',
    entityId: String(sheet._id),
    entityRef: sheet.slug,
    summary,
    extra,
  })
}

// GET /meta — listes de référence pour les formulaires
router.get('/meta', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const canEdit = canEditSheets(req.user?.role)
    const payload: Record<string, unknown> = {
      statuses: PROJECT_SHEET_STATUSES,
      reviewStatuses: PROJECT_SHEET_REVIEW_STATUSES,
      entities: GROUP_ENTITIES,
      leadProjects: LEAD_PROJECTS,
      linkTypes: PROJECT_SHEET_LINK_TYPES,
      sectionKeys: PROJECT_SHEET_SECTIONS,
      canEdit,
      canReveal: canRevealDemoAccess(req.user?.role),
    }
    if (canEdit) {
      const [members, devProjects] = await Promise.all([
        User.find({ role: { $in: ADMIN_ROLES }, isActive: { $ne: false }, archivedAt: null })
          .select('name email role')
          .sort({ name: 1 })
          .lean(),
        DevProject.find({}).select('key name').sort({ name: 1 }).lean(),
      ])
      payload.members = members
      payload.devProjects = devProjects
    }
    return res.json(payload)
  } catch (err) {
    return fail(err, res, next)
  }
})

// GET / — cartes ; ?q= recherche plein texte ; ?archived=true inclut les archivées
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter = req.query.archived === 'true' ? {} : { archived: false }
    const sheets = await ProjectSheet.find(filter)
      // Pas de « -demoAccesses » : collision avec le select:false du mot de passe.
      // Les cartes et la recherche ignorent de toute façon les accès démo.
      .select('-history')
      .populate('referent', 'name')
      .sort({ name: 1 })
      .lean()
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : ''
    const results = q.trim()
      ? searchSheets(sheets, q).map(({ sheet, matches }) => ({ ...serializeSheetCard(sheet), matches }))
      : sheets.map(serializeSheetCard)
    return res.json({ sheets: results, canEdit: canEditSheets(req.user?.role) })
  } catch (err) {
    return fail(err, res, next)
  }
})

// GET /:idOrSlug — fiche complète (sans aucun mot de passe)
router.get('/:idOrSlug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sheet = await detailPayload(req, sheetLookup(req.params.idOrSlug))
    if (!sheet) return res.status(404).json({ error: 'Fiche introuvable' })
    return res.json({ sheet })
  } catch (err) {
    return fail(err, res, next)
  }
})

// POST / — créer une fiche
router.post('/', requireEditor, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = pickSheetInput(req.body)
    if (!String(input.name ?? '').trim()) return res.status(400).json({ error: 'Le nom est requis.' })
    await checkReferences(input, req.user!.role)
    const sheet = new ProjectSheet({ ...input, slug: await uniqueSlug(String(input.name)), createdBy: req.user!.id })
    pushHistory(sheet.history, historyEntry(req.user!.id, Object.keys(input), 'Création de la fiche'))
    await sheet.save()
    await auditSheet(req, 'PROJECT_SHEET_CREATE', sheet, `Fiche « ${sheet.name} » créée`, {
      fields: Object.keys(input),
    })
    return res.status(201).json({ sheet: await detailPayload(req, { _id: sheet._id }) })
  } catch (err) {
    return fail(err, res, next)
  }
})

// PATCH /:id — modifier une ou plusieurs sections (baseUpdatedAt : contrôle de conflit)
router.patch('/:id', requireEditor, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sheet = await ProjectSheet.findOne(sheetLookup(req.params.id)).select(PASSWORD_FIELD)
    if (!sheet) return res.status(404).json({ error: 'Fiche introuvable' })
    const base = req.body?.baseUpdatedAt
    if (base !== undefined && base !== null) {
      const at = new Date(String(base)).getTime()
      if (Number.isNaN(at) || at !== sheet.updatedAt.getTime())
        return res.status(409).json({ error: 'La fiche a été modifiée entre-temps.', code: 'SHEET_CONFLICT' })
    }
    const input = pickSheetInput(req.body)
    await checkReferences(input, req.user!.role)
    const before = sheet.toObject({ depopulate: true }) as unknown as Record<string, unknown>
    const fields = changedFields(before, input)
    if (fields.length) {
      sheet.set(Object.fromEntries(fields.map((f) => [f, input[f]])))
      pushHistory(sheet.history, historyEntry(req.user!.id, fields, 'Modification'))
      await sheet.save()
      await auditSheet(req, 'PROJECT_SHEET_UPDATE', sheet, `Fiche « ${sheet.name} » modifiée`, { fields })
    }
    return res.json({ sheet: await detailPayload(req, { _id: sheet._id }) })
  } catch (err) {
    return fail(err, res, next)
  }
})

// ── ACCÈS DÉMO ───────────────────────────────────────────────────────────────
// Comptes de démonstration à données fictives. Mot de passe chiffré au repos,
// jamais renvoyé hors de /reveal ; l'historique de la fiche ne note que
// « accès démo modifié », l'audit trace qui, quand et quel accès.

function demoInput(body: unknown, creating: boolean) {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const key of ['url', 'role', 'username', 'notes', 'password'] as const) {
    const value = input[key]
    if (value === undefined || value === null) continue
    if (typeof value !== 'string') throw new SheetInputError(`Champ « ${key} » : texte attendu.`)
    out[key] = key === 'password' ? value : value.trim()
  }
  if (out.password !== undefined && out.password.length > 500) throw new SheetInputError('Mot de passe trop long.')
  if (creating && !out.url && !out.username && !out.role)
    throw new SheetInputError('Renseignez au moins l’URL, le rôle ou l’identifiant.')
  return out
}

async function saveDemoChange(req: Request, res: Response, sheet: InstanceType<typeof ProjectSheet>, status: number) {
  pushHistory(sheet.history, historyEntry(req.user!.id, ['demoAccesses'], DEMO_ACCESS_HISTORY_SUMMARY))
  await sheet.save()
  res.setHeader('Cache-Control', 'no-store')
  return res.status(status).json({ demoAccesses: publicDemoAccesses(sheet.toObject().demoAccesses) })
}

router.post('/:id/demo-accesses', requireEditor, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sheet = await ProjectSheet.findOne(sheetLookup(req.params.id)).select(PASSWORD_FIELD)
    if (!sheet) return res.status(404).json({ error: 'Fiche introuvable' })
    const { password, ...fields } = demoInput(req.body, true)
    sheet.demoAccesses.push({
      ...fields,
      passwordEnc: password ? encryptSecret(password) : '',
      updatedAt: new Date(),
      updatedBy: req.user!.id,
    } as never)
    const access = sheet.demoAccesses[sheet.demoAccesses.length - 1]!
    const response = await saveDemoChange(req, res, sheet, 201)
    await auditSheet(req, 'PROJECT_SHEET_DEMO_ACCESS_CREATE', sheet, 'Accès démo ajouté', {
      accessId: String(access._id),
      accessRole: access.role,
    })
    return response
  } catch (err) {
    return fail(err, res, next)
  }
})

router.patch('/:id/demo-accesses/:accessId', requireEditor, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sheet = await ProjectSheet.findOne(sheetLookup(req.params.id)).select(PASSWORD_FIELD)
    if (!sheet) return res.status(404).json({ error: 'Fiche introuvable' })
    const access = sheet.demoAccesses.find((a) => String(a._id) === req.params.accessId)
    if (!access) return res.status(404).json({ error: 'Accès démo introuvable' })
    const { password, ...fields } = demoInput(req.body, false)
    Object.assign(access, fields)
    // Mot de passe vide ou absent : inchangé.
    if (password) access.passwordEnc = encryptSecret(password)
    access.updatedAt = new Date()
    access.updatedBy = new mongoose.Types.ObjectId(req.user!.id)
    const response = await saveDemoChange(req, res, sheet, 200)
    await auditSheet(req, 'PROJECT_SHEET_DEMO_ACCESS_UPDATE', sheet, 'Accès démo modifié', {
      accessId: String(access._id),
      accessRole: access.role,
      fields: [...Object.keys(fields), ...(password ? ['password'] : [])],
    })
    return response
  } catch (err) {
    return fail(err, res, next)
  }
})

router.delete(
  '/:id/demo-accesses/:accessId',
  requireEditor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sheet = await ProjectSheet.findOne(sheetLookup(req.params.id)).select(PASSWORD_FIELD)
      if (!sheet) return res.status(404).json({ error: 'Fiche introuvable' })
      const index = sheet.demoAccesses.findIndex((a) => String(a._id) === req.params.accessId)
      if (index === -1) return res.status(404).json({ error: 'Accès démo introuvable' })
      const [removed] = sheet.demoAccesses.splice(index, 1)
      const response = await saveDemoChange(req, res, sheet, 200)
      await auditSheet(req, 'PROJECT_SHEET_DEMO_ACCESS_DELETE', sheet, 'Accès démo supprimé', {
        accessId: String(removed?._id),
        accessRole: removed?.role ?? '',
      })
      return response
    } catch (err) {
      return fail(err, res, next)
    }
  },
)

// POST /:id/demo-accesses/:accessId/reveal — mot de passe en clair, journalisé
router.post('/:id/demo-accesses/:accessId/reveal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canRevealDemoAccess(req.user?.role)) return res.status(403).json({ error: 'Forbidden' })
    const sheet = await ProjectSheet.findOne(sheetLookup(req.params.id)).select(PASSWORD_FIELD).lean()
    if (!sheet) return res.status(404).json({ error: 'Fiche introuvable' })
    const access = (sheet.demoAccesses ?? []).find((a) => String(a._id) === req.params.accessId)
    if (!access) return res.status(404).json({ error: 'Accès démo introuvable' })
    await auditSheet(req, 'PROJECT_SHEET_DEMO_ACCESS_REVEAL', sheet, 'Mot de passe d’accès démo affiché', {
      accessId: String(access._id),
      accessRole: access.role,
      accessUrl: access.url,
    })
    res.setHeader('Cache-Control', 'no-store')
    return res.json({ password: decryptSecret(access.passwordEnc || '') })
  } catch (err) {
    return fail(err, res, next)
  }
})

export default router
