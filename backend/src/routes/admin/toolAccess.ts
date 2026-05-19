import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import ToolAccess from '../../models/ToolAccess.js'
import AuditLog from '../../models/AuditLog.js'
import { encrypt, decrypt, isEncryptionConfigured, looksEncrypted } from '../../lib/crypto.js'
import { notifyInternalAdmins } from '../../lib/notifyHelpers.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

/**
 * Encrypt password if encryption is configured, otherwise store as-is.
 */
function encryptPassword(plain: string): string {
  if (isEncryptionConfigured()) {
    return encrypt(plain)
  }
  return plain
}

/**
 * Decrypt password if it looks encrypted, otherwise return as-is.
 */
function decryptPassword(stored: string): string {
  if (isEncryptionConfigured() && looksEncrypted(stored)) {
    try {
      return decrypt(stored)
    } catch {
      return stored // fallback for pre-encryption data
    }
  }
  return stored
}

/**
 * Sanitize tool for response — decrypt password.
 */
function sanitizeTool(tool: any): any {
  const obj = tool.toObject ? tool.toObject() : { ...tool }
  if (obj.password) {
    obj.password = decryptPassword(obj.password)
  }
  return obj
}

// GET all tool accesses (all admins can read)
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tools = await ToolAccess.find().sort({ category: 1, name: 1 })
    res.json(tools.map(sanitizeTool))
  } catch (err) {
    next(err)
  }
})

// GET single tool access — audit logged
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tool = await ToolAccess.findById(req.params.id)
    if (!tool) return res.status(404).json({ error: 'Outil introuvable' })

    // Audit: log credential access
    AuditLog.create({
      userId: req.user!.id,
      email: req.user!.email,
      action: 'TOOL_ACCESS_VIEWED',
      ip: req.headers['x-forwarded-for'] || req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      metadata: { toolId: tool._id.toString(), toolName: tool.name },
    }).catch(() => {})

    res.json(sanitizeTool(tool))
  } catch (err) {
    next(err)
  }
})

// POST create (SUPER_ADMIN + ADMIN only)
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acces reserve aux administrateurs' })
    }
    const { name, url, login, password, category, notes } = req.body
    if (!name || !login || !password) {
      return res.status(400).json({ error: 'Nom, login et mot de passe requis' })
    }
    const tool = await ToolAccess.create({
      name,
      url: url || '',
      login,
      password: encryptPassword(password),
      category: category || 'AUTRE',
      notes: notes || '',
      addedBy: user.id,
      addedByName: user.name || user.email,
      lastRotatedAt: new Date(),
    })

    AuditLog.create({
      userId: user.id,
      email: user.email,
      action: 'TOOL_ACCESS_CREATED',
      ip: req.headers['x-forwarded-for'] || req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      metadata: { toolId: tool._id.toString(), toolName: name },
    }).catch(() => {})

    // Notif tous les admins internes (les accès outils sont partagés)
    notifyInternalAdmins({
      type: 'TOOL_ACCESS_GRANTED',
      title: `Nouvel accès outil`,
      message: `${name} (${category || 'AUTRE'}) ajouté par ${user.name || user.email}`,
      link: '/admin/tools',
      metadata: { toolId: String(tool._id) },
      excludeUserId: user.id,
    }).catch(() => {})

    res.status(201).json(sanitizeTool(tool))
  } catch (err) {
    next(err)
  }
})

// PATCH update (SUPER_ADMIN + ADMIN only)
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acces reserve aux administrateurs' })
    }
    const { name, url, login, password, category, notes } = req.body
    const update: Record<string, unknown> = {}
    if (name !== undefined) update.name = name
    if (url !== undefined) update.url = url
    if (login !== undefined) update.login = login
    if (password !== undefined) {
      update.password = encryptPassword(password)
      update.lastRotatedAt = new Date()
    }
    if (category !== undefined) update.category = category
    if (notes !== undefined) update.notes = notes

    const tool = await ToolAccess.findByIdAndUpdate(req.params.id, { $set: update }, { new: true })
    if (!tool) return res.status(404).json({ error: 'Outil introuvable' })

    AuditLog.create({
      userId: user.id,
      email: user.email,
      action: 'TOOL_ACCESS_UPDATED',
      ip: req.headers['x-forwarded-for'] || req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      metadata: { toolId: tool._id.toString(), toolName: tool.name, fieldsUpdated: Object.keys(update) },
    }).catch(() => {})

    res.json(sanitizeTool(tool))
  } catch (err) {
    next(err)
  }
})

// DELETE (SUPER_ADMIN only)
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!
    if (user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Acces reserve au super admin' })
    }
    const tool = await ToolAccess.findByIdAndDelete(req.params.id)
    if (!tool) return res.status(404).json({ error: 'Outil introuvable' })

    AuditLog.create({
      userId: user.id,
      email: user.email,
      action: 'TOOL_ACCESS_DELETED',
      ip: req.headers['x-forwarded-for'] || req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      metadata: { toolId: tool._id.toString(), toolName: tool.name },
    }).catch(() => {})

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
