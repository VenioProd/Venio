import express, { type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import InternalTicket from '../../models/InternalTicket.js'
import User from '../../models/User.js'
import { createNotification } from '../../lib/notifications.js'
import { sendTicketReplyEmail } from '../../lib/email.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

const uploadsDir = path.resolve('uploads/tickets')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

// Serve uploaded files
router.get('/files/:filename', (req: Request, res: Response) => {
  const filePath = path.join(uploadsDir, req.params.filename as string)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' })
  res.sendFile(filePath)
})

// GET /api/admin/tickets — active tickets only (not archived)
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { status, category, priority } = req.query
    const filter: Record<string, unknown> = { isArchived: { $ne: true } }
    if (status) filter.status = status
    if (category) filter.category = category
    if (priority) filter.priority = priority

    // Non-SUPER_ADMIN ne voit que ses propres tickets
    if (user.role !== 'SUPER_ADMIN') {
      filter.authorId = user.id
    }

    const tickets = await InternalTicket.find(filter).sort({ createdAt: -1 })
    res.json(tickets)
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/tickets/stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [open, inProgress, total] = await Promise.all([
      InternalTicket.countDocuments({ status: 'OUVERT', isArchived: { $ne: true } }),
      InternalTicket.countDocuments({ status: 'EN_COURS', isArchived: { $ne: true } }),
      InternalTicket.countDocuments({ isArchived: { $ne: true } }),
    ])
    res.json({ open, inProgress, total })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/tickets/archived — archived tickets
router.get('/archived', async (_req: Request, res: Response) => {
  try {
    const tickets = await InternalTicket.find({ isArchived: true }).sort({ archivedAt: -1 })
    res.json(tickets)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/tickets/kpi — KPI stats
router.get('/kpi', async (req: Request, res: Response) => {
  try {
    const { period } = req.query // 'week' | 'month' | 'all'
    const now = new Date()
    let since: Date

    if (period === 'week') {
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (period === 'month') {
      since = new Date(now.getFullYear(), now.getMonth(), 1)
    } else {
      since = new Date(0)
    }

    const allTickets = await InternalTicket.find({ createdAt: { $gte: since } })

    const totalCreated = allTickets.length
    const archived = allTickets.filter((t) => t.isArchived).length
    const resolved = allTickets.filter((t) => t.status === 'RESOLU' || t.status === 'FERME').length
    const open = allTickets.filter((t) => t.status === 'OUVERT' && !t.isArchived).length
    const inProgress = allTickets.filter((t) => t.status === 'EN_COURS' && !t.isArchived).length

    // Par catégorie
    const byCategory: Record<string, number> = { QUESTION: 0, DEMANDE: 0, PROBLEME: 0 }
    allTickets.forEach((t) => { byCategory[t.category] = (byCategory[t.category] || 0) + 1 })

    // Par priorité
    const byPriority: Record<string, number> = { BASSE: 0, NORMALE: 0, HAUTE: 0, URGENTE: 0 }
    allTickets.forEach((t) => { byPriority[t.priority] = (byPriority[t.priority] || 0) + 1 })

    // Total réponses
    const totalReplies = allTickets.reduce((sum, t) => sum + t.replies.length, 0)

    // Temps moyen de première réponse (en heures)
    const responseTimes: number[] = []
    allTickets.forEach((t) => {
      if (t.replies.length > 0) {
        const created = new Date(t.createdAt).getTime()
        const firstReply = new Date(t.replies[0].createdAt).getTime()
        responseTimes.push((firstReply - created) / (1000 * 60 * 60))
      }
    })
    const avgResponseTime = responseTimes.length > 0
      ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10
      : null

    // Taux de résolution
    const resolutionRate = totalCreated > 0 ? Math.round((resolved / totalCreated) * 100) : 0

    // Top auteurs
    const authorMap: Record<string, number> = {}
    allTickets.forEach((t) => { authorMap[t.authorName] = (authorMap[t.authorName] || 0) + 1 })
    const topAuthors = Object.entries(authorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))

    res.json({
      totalCreated,
      archived,
      resolved,
      open,
      inProgress,
      byCategory,
      byPriority,
      totalReplies,
      avgResponseTime,
      resolutionRate,
      topAuthors,
    })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/tickets/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const ticket = await InternalTicket.findById(req.params.id)
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' })
    res.json(ticket)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/admin/tickets — create ticket
router.post('/', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { title, message, category, priority } = req.body
    if (!message) return res.status(400).json({ error: 'Message requis' })

    // Auto-générer le titre si non fourni
    const CATEGORY_LABELS_GEN: Record<string, string> = { QUESTION: 'Question', DEMANDE: 'Demande', PROBLEME: 'Probleme' }
    const cat = category || 'QUESTION'
    const autoTitle = title || `${CATEGORY_LABELS_GEN[cat] || cat} — ${message.slice(0, 50).trim()}${message.length > 50 ? '...' : ''}`

    const files = (req.files as Express.Multer.File[]) || []
    const attachments = files.map((f) => ({
      filename: f.filename,
      originalName: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
    }))

    const ticket = await InternalTicket.create({
      title: autoTitle, message,
      category: cat,
      priority: priority || 'NORMALE',
      authorId: user.id,
      authorName: user.name,
      attachments,
    })

    const superAdmins = await User.find({ role: 'SUPER_ADMIN' }).select('_id')
    const CATEGORY_LABELS: Record<string, string> = { QUESTION: 'Question', DEMANDE: 'Demande', PROBLEME: 'Probleme' }
    const catLabel = CATEGORY_LABELS[ticket.category] || ticket.category
    for (const admin of superAdmins) {
      if (admin._id.toString() === user.id) continue
      createNotification({
        recipient: admin._id,
        type: 'TICKET_CREATED',
        title: `Nouveau ticket : ${ticket.title}`,
        message: `${user.name} a cree un ticket (${catLabel})`,
        link: '/admin/tickets',
      }).catch(() => {})
    }

    res.status(201).json(ticket)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/admin/tickets/:id/reply
router.post('/:id/reply', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Seuls les super admins peuvent repondre' })

    const { message } = req.body
    if (!message) return res.status(400).json({ error: 'Message requis' })

    const ticket = await InternalTicket.findById(req.params.id)
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' })

    const files = (req.files as Express.Multer.File[]) || []
    const attachments = files.map((f) => ({
      filename: f.filename, originalName: f.originalname, mimetype: f.mimetype, size: f.size,
    }))

    ticket.replies.push({ authorId: user.id, authorName: user.name, message, attachments, createdAt: new Date() })
    if (ticket.status === 'OUVERT') ticket.status = 'EN_COURS'
    await ticket.save()

    if (ticket.authorId.toString() !== user.id) {
      // Notification on-site
      createNotification({
        recipient: ticket.authorId,
        type: 'TICKET_REPLY',
        title: `Reponse a votre ticket : ${ticket.title}`,
        message: `${user.name} a repondu a votre ticket`,
        link: '/admin/tickets',
      }).catch(() => {})

      // Notification email
      const author = await User.findById(ticket.authorId).select('email name')
      if (author?.email) {
        sendTicketReplyEmail({
          to: author.email,
          authorName: author.name || ticket.authorName,
          replierName: user.name,
          ticketTitle: ticket.title,
          replyMessage: message,
        }).catch(() => {})
      }
    }

    res.json(ticket)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PATCH /api/admin/tickets/:id/mark-read — l'auteur marque comme lu → ferme + archive
router.patch('/:id/mark-read', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const ticket = await InternalTicket.findById(req.params.id)
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' })

    // Seul l'auteur du ticket peut marquer comme lu
    if (ticket.authorId.toString() !== user.id) {
      return res.status(403).json({ error: 'Non autorise' })
    }

    // Seulement si le ticket a des réponses et n'est pas déjà archivé
    if (ticket.replies.length > 0 && !ticket.isArchived) {
      ticket.status = 'FERME'
      ticket.isArchived = true
      ticket.archivedAt = new Date()
      await ticket.save()
    }

    res.json(ticket)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PATCH /api/admin/tickets/:id/status
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Seuls les super admins peuvent changer le statut' })

    const { status } = req.body
    if (!['OUVERT', 'EN_COURS', 'RESOLU', 'FERME'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' })
    }

    const ticket = await InternalTicket.findByIdAndUpdate(req.params.id, { status }, { new: true })
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' })
    res.json(ticket)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PATCH /api/admin/tickets/:id/archive — archive a closed ticket (SUPER_ADMIN)
router.patch('/:id/archive', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Seuls les super admins peuvent archiver' })

    const ticket = await InternalTicket.findById(req.params.id)
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' })

    ticket.isArchived = true
    ticket.archivedAt = new Date()
    if (ticket.status !== 'FERME') ticket.status = 'FERME'
    await ticket.save()
    res.json(ticket)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PATCH /api/admin/tickets/:id/unarchive — restore an archived ticket (SUPER_ADMIN)
router.patch('/:id/unarchive', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Forbidden' })

    const ticket = await InternalTicket.findByIdAndUpdate(
      req.params.id,
      { isArchived: false, archivedAt: null },
      { new: true }
    )
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' })
    res.json(ticket)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// DELETE /api/admin/tickets/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Seuls les super admins peuvent supprimer' })

    const ticket = await InternalTicket.findById(req.params.id)
    if (ticket) {
      const allFiles = [...ticket.attachments, ...ticket.replies.flatMap((r) => r.attachments || [])]
      for (const f of allFiles) {
        const filePath = path.join(uploadsDir, f.filename)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      }
    }

    await InternalTicket.findByIdAndDelete(req.params.id)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
