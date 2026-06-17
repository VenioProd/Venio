import express, { type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import auth from '../../middleware/auth.js'
import { requireSuperAdmin } from '../../middleware/role.js'
import Subsidiary, {
  SUBSIDIARY_STATUSES,
  SUBSIDIARY_HEALTHS,
  DOCUMENT_CATEGORIES,
  LINK_TYPES,
  CREDENTIAL_CATEGORIES,
} from '../../models/Subsidiary.js'
import InternalProject, { ENTITIES } from '../../models/InternalProject.js'
import { syncUploadToNextcloud } from '../../lib/nextcloud.js'
import { encryptSecret, decryptSecret } from '../../lib/secretBox.js'

const router = express.Router()
router.use(auth)
router.use(requireSuperAdmin)

// Dossier d'upload pour les pièces jointes des filiales
const subsidiaryUploadsDir = path.resolve('uploads/subsidiary-docs')
if (!fs.existsSync(subsidiaryUploadsDir)) fs.mkdirSync(subsidiaryUploadsDir, { recursive: true })

const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, subsidiaryUploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    cb(null, `${unique}${path.extname(file.originalname)}`)
  },
})
const docUpload = multer({ storage: docStorage, limits: { fileSize: 50 * 1024 * 1024 } }) // 50 Mo

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
  'productDescription',
  'serviceDescription',
  'businessModel',
  'businessPlan',
  'sections',
  'links',
  'infos',
  'contacts',
  'accentColor',
  'lead',
  'foundedYear',
  'linkedEntity',
  'team',
  'kpis',
  'objective',
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

/** Retire les secrets chiffrés et expose seulement un drapeau hasSecret. */
function sanitizeCredentials(creds: any[] = []): any[] {
  return creds.map((c) => {
    const { secretEnc, ...rest } = c
    return { ...rest, hasSecret: Boolean(secretEnc) }
  })
}

/** Nettoie une filiale (lean) avant de la renvoyer : credentials sans secret. */
function sanitizeSubsidiary<T extends { credentials?: any[] }>(s: T): T {
  return { ...s, credentials: sanitizeCredentials(s.credentials) }
}

// GET /meta — listes pour les formulaires (statuts, santé, entités liables)
router.get('/meta', (_req: Request, res: Response) => {
  res.json({
    statuses: SUBSIDIARY_STATUSES,
    healths: SUBSIDIARY_HEALTHS,
    entities: ENTITIES,
    linkTypes: LINK_TYPES,
    credentialCategories: CREDENTIAL_CATEGORIES,
  })
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
        return { ...sanitizeSubsidiary(s), projectCounts: counts, headcount }
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
    return res.json({
      subsidiary: { ...sanitizeSubsidiary(subsidiary), linkedProjects: projects, projectCounts: counts },
    })
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
      .lean()
    return res.status(201).json({ subsidiary: populated ? sanitizeSubsidiary(populated) : null })
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
      .lean()
    return res.json({ subsidiary: populated ? sanitizeSubsidiary(populated) : null })
  } catch (err) {
    return next(err)
  }
})

// DELETE /:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subsidiary = await Subsidiary.findById(req.params.id)
    if (!subsidiary) return res.status(404).json({ error: 'Filiale introuvable' })
    // Nettoyage des fichiers physiques
    for (const doc of subsidiary.documents) {
      if (doc.storagePath && fs.existsSync(doc.storagePath)) {
        try {
          fs.unlinkSync(doc.storagePath)
        } catch {
          /* ignore */
        }
      }
    }
    await subsidiary.deleteOne()
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

// ── DOCUMENTS ───────────────────────────────────────────────────────────────

// POST /:id/documents — uploader un fichier rattaché à une partie du dossier
router.post('/:id/documents', docUpload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' })
    const subsidiary = await Subsidiary.findById(req.params.id)
    if (!subsidiary) {
      fs.unlinkSync(req.file.path)
      return res.status(404).json({ error: 'Filiale introuvable' })
    }
    const category = DOCUMENT_CATEGORIES.includes(req.body.category) ? req.body.category : 'general'
    subsidiary.documents.push({
      category,
      label: (req.body.label || '').trim(),
      originalName: req.file.originalname,
      storagePath: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user!.id as any,
      uploadedAt: new Date(),
    })
    await subsidiary.save()
    syncUploadToNextcloud(req.file, 'filiales', String(subsidiary._id))
    return res.status(201).json({ documents: subsidiary.documents })
  } catch (err) {
    return next(err)
  }
})

// GET /:id/documents/:docId — télécharger / visualiser un fichier
router.get('/:id/documents/:docId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subsidiary = await Subsidiary.findById(req.params.id)
    if (!subsidiary) return res.status(404).json({ error: 'Filiale introuvable' })
    const doc = subsidiary.documents.find((d) => (d as any)._id?.toString() === req.params.docId)
    if (!doc) return res.status(404).json({ error: 'Document introuvable' })
    const filePath = path.resolve(doc.storagePath)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier manquant sur le serveur' })
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`)
    res.setHeader('Content-Type', doc.mimeType)
    // dotfiles: 'allow' — le chemin peut contenir un segment commençant par « . »
    return res.sendFile(filePath, { dotfiles: 'allow' })
  } catch (err) {
    return next(err)
  }
})

// DELETE /:id/documents/:docId
router.delete('/:id/documents/:docId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subsidiary = await Subsidiary.findById(req.params.id)
    if (!subsidiary) return res.status(404).json({ error: 'Filiale introuvable' })
    const idx = subsidiary.documents.findIndex((d) => (d as any)._id?.toString() === req.params.docId)
    if (idx === -1) return res.status(404).json({ error: 'Document introuvable' })
    const doc = subsidiary.documents[idx]
    if (doc.storagePath && fs.existsSync(doc.storagePath)) {
      try {
        fs.unlinkSync(doc.storagePath)
      } catch {
        /* ignore */
      }
    }
    subsidiary.documents.splice(idx, 1)
    await subsidiary.save()
    return res.json({ documents: subsidiary.documents })
  } catch (err) {
    return next(err)
  }
})

// ── COFFRE D'IDENTIFIANTS ─────────────────────────────────────────────────────
// Le secret est chiffré au repos ; il n'est renvoyé en clair que via /reveal.

// POST /:id/credentials — ajouter un identifiant
router.post('/:id/credentials', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subsidiary = await Subsidiary.findById(req.params.id)
    if (!subsidiary) return res.status(404).json({ error: 'Filiale introuvable' })

    const { category, label, username, secret, url, notes } = req.body
    if (!label?.trim()) return res.status(400).json({ error: 'Le libellé est requis' })

    subsidiary.credentials.push({
      category: CREDENTIAL_CATEGORIES.includes(category) ? category : 'admin',
      label: label.trim(),
      username: (username || '').trim(),
      secretEnc: secret ? encryptSecret(String(secret)) : '',
      url: (url || '').trim(),
      notes: (notes || '').trim(),
    })
    await subsidiary.save()
    return res
      .status(201)
      .json({ credentials: sanitizeCredentials(subsidiary.credentials.map((c) => (c as any).toObject())) })
  } catch (err) {
    return next(err)
  }
})

// PATCH /:id/credentials/:credId — mettre à jour (secret réécrit seulement si fourni)
router.patch('/:id/credentials/:credId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subsidiary = await Subsidiary.findById(req.params.id)
    if (!subsidiary) return res.status(404).json({ error: 'Filiale introuvable' })
    const cred = subsidiary.credentials.find((c) => (c as any)._id?.toString() === req.params.credId)
    if (!cred) return res.status(404).json({ error: 'Identifiant introuvable' })

    const { category, label, username, secret, url, notes } = req.body
    if (category !== undefined && CREDENTIAL_CATEGORIES.includes(category)) cred.category = category
    if (label !== undefined) cred.label = String(label).trim()
    if (username !== undefined) cred.username = String(username).trim()
    if (url !== undefined) cred.url = String(url).trim()
    if (notes !== undefined) cred.notes = String(notes).trim()
    if (secret !== undefined && secret !== '') cred.secretEnc = encryptSecret(String(secret))

    await subsidiary.save()
    return res.json({ credentials: sanitizeCredentials(subsidiary.credentials.map((c) => (c as any).toObject())) })
  } catch (err) {
    return next(err)
  }
})

// DELETE /:id/credentials/:credId
router.delete('/:id/credentials/:credId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subsidiary = await Subsidiary.findById(req.params.id)
    if (!subsidiary) return res.status(404).json({ error: 'Filiale introuvable' })
    const idx = subsidiary.credentials.findIndex((c) => (c as any)._id?.toString() === req.params.credId)
    if (idx === -1) return res.status(404).json({ error: 'Identifiant introuvable' })
    subsidiary.credentials.splice(idx, 1)
    await subsidiary.save()
    return res.json({ credentials: sanitizeCredentials(subsidiary.credentials.map((c) => (c as any).toObject())) })
  } catch (err) {
    return next(err)
  }
})

// GET /:id/credentials/:credId/reveal — déchiffrer et renvoyer le secret
router.get('/:id/credentials/:credId/reveal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subsidiary = await Subsidiary.findById(req.params.id).lean()
    if (!subsidiary) return res.status(404).json({ error: 'Filiale introuvable' })
    const cred = (subsidiary.credentials || []).find((c: any) => c._id?.toString() === req.params.credId)
    if (!cred) return res.status(404).json({ error: 'Identifiant introuvable' })
    return res.json({ secret: decryptSecret((cred as any).secretEnc || '') })
  } catch (err) {
    return next(err)
  }
})

export default router
