import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import ToolAccess from '../../models/ToolAccess.js'
import AuditLog from '../../models/AuditLog.js'
import User from '../../models/User.js'
import { TOTP } from 'otpauth'
import { encrypt, decrypt, requireEncryptionConfigured, looksEncrypted } from '../../lib/crypto.js'
import { notifyInternalAdmins } from '../../lib/notifyHelpers.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

function encryptPassword(plain: string): string {
  requireEncryptionConfigured()
  return encrypt(plain)
}

function decryptPassword(stored: string): string {
  requireEncryptionConfigured()
  if (!looksEncrypted(stored)) {
    throw new Error('This credential must be rotated before it can be revealed')
  }
  return decrypt(stored)
}

function sanitizeTool(tool: any): any {
  const obj = tool.toObject ? tool.toObject() : { ...tool }
  delete obj.password
  return obj
}

async function verifyRevealStepUp(userId: string, code: unknown): Promise<boolean> {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false
  const user = await User.findById(userId).select('email twoFactorEnabled twoFactorSecret').lean()
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) return false
  const totp = new TOTP({ issuer: 'Venio', label: user.email, algorithm: 'SHA1', digits: 6, period: 30, secret: user.twoFactorSecret })
  return totp.validate({ token: code, window: 1 }) !== null
}

// GET all tool accesses — filtrés par visibilité selon le rôle
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = req.user!.role
    const filter = role === 'SUPER_ADMIN'
      ? {}
      : { $or: [{ visibleTo: { $size: 0 } }, { visibleTo: role }] }
    const tools = await ToolAccess.find(filter).sort({ category: 1, name: 1 })
    res.json(tools.map(sanitizeTool))
  } catch (err) {
    next(err)
  }
})

// GET single tool access — metadata only. Secrets use the explicit reveal route.
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = req.user!.role
    const tool = await ToolAccess.findById(req.params.id)
    if (!tool) return res.status(404).json({ error: 'Outil introuvable' })
    if (role !== 'SUPER_ADMIN' && tool.visibleTo.length > 0 && !tool.visibleTo.includes(role)) {
      return res.status(403).json({ error: 'Accès refusé' })
    }

    res.json(sanitizeTool(tool))
  } catch (err) {
    next(err)
  }
})

// POST reveal — an explicit, short-lived action protected by a fresh TOTP code.
router.post('/:id/reveal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = req.user!.role
    if (role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Accès réservé au super admin' })
    if (!await verifyRevealStepUp(req.user!.id, req.body?.totpCode)) {
      return res.status(403).json({ error: 'Code MFA requis ou invalide' })
    }
    const tool = await ToolAccess.findById(req.params.id)
    if (!tool) return res.status(404).json({ error: 'Outil introuvable' })
    const password = decryptPassword(tool.password)
    AuditLog.create({
      userId: req.user!.id,
      email: req.user!.email,
      action: 'TOOL_ACCESS_REVEALED',
      ip: req.headers['x-forwarded-for'] || req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      metadata: { toolId: tool._id.toString(), toolName: tool.name },
    }).catch(() => {})
    res.set('Cache-Control', 'no-store')
    res.json({ password })
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
    const { name, url, login, password, category, notes, visibleTo } = req.body
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
      visibleTo: Array.isArray(visibleTo) ? visibleTo : [],
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
    const { name, url, login, password, category, notes, visibleTo } = req.body
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
    if (visibleTo !== undefined) update.visibleTo = Array.isArray(visibleTo) ? visibleTo : []

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
