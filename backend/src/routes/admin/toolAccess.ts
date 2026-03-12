import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import ToolAccess from '../../models/ToolAccess.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

// GET all tool accesses (all admins can read)
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tools = await ToolAccess.find().sort({ category: 1, name: 1 })
    res.json(tools)
  } catch (err) {
    next(err)
  }
})

// GET single tool access
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tool = await ToolAccess.findById(req.params.id)
    if (!tool) return res.status(404).json({ error: 'Outil introuvable' })
    res.json(tool)
  } catch (err) {
    next(err)
  }
})

// POST create (SUPER_ADMIN + ADMIN only)
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user
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
      password,
      category: category || 'AUTRE',
      notes: notes || '',
      addedBy: user.id,
      addedByName: user.name || user.email,
    })
    res.status(201).json(tool)
  } catch (err) {
    next(err)
  }
})

// PATCH update (SUPER_ADMIN + ADMIN only)
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acces reserve aux administrateurs' })
    }
    const { name, url, login, password, category, notes } = req.body
    const update: Record<string, unknown> = {}
    if (name !== undefined) update.name = name
    if (url !== undefined) update.url = url
    if (login !== undefined) update.login = login
    if (password !== undefined) update.password = password
    if (category !== undefined) update.category = category
    if (notes !== undefined) update.notes = notes

    const tool = await ToolAccess.findByIdAndUpdate(req.params.id, { $set: update }, { new: true })
    if (!tool) return res.status(404).json({ error: 'Outil introuvable' })
    res.json(tool)
  } catch (err) {
    next(err)
  }
})

// DELETE (SUPER_ADMIN only)
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Acces reserve au super admin' })
    }
    const tool = await ToolAccess.findByIdAndDelete(req.params.id)
    if (!tool) return res.status(404).json({ error: 'Outil introuvable' })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
