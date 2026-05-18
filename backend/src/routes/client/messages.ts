import express, { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import Project from '../../models/Project.js'
import Message from '../../models/Message.js'
import User from '../../models/User.js'
import { createNotification } from '../../lib/notifications.js'
import { shouldNotify } from '../../lib/notificationPreferences.js'
import { getTransporter, escapeHtml, getAdminBaseUrl } from '../../lib/email/transport.js'
import { emailLayout } from '../../lib/email/layout.js'

const router = express.Router()

router.use(auth)

// GET /api/projects/:projectId/messages — list messages for a project
router.get('/:projectId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { projectId } = req.params

    const project = await Project.findOne({ _id: projectId, client: req.user!.id })
    if (!project) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    const messages = await Message.find({ project: projectId })
      .sort({ createdAt: 1 })
      .limit(100)
      .populate('sender', 'name role')

    return res.json({ messages })
  } catch (err) {
    return next(err)
  }
})

// POST /api/projects/:projectId/messages — create message
router.post(
  '/:projectId/messages',
  body('content').trim().notEmpty().withMessage('Le contenu du message est requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== 'CLIENT') {
        return res.status(403).json({ error: 'Forbidden' })
      }

      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const { projectId } = req.params

      const project = await Project.findOne({ _id: projectId, client: req.user!.id })
      if (!project) {
        return res.status(404).json({ error: 'Projet non trouvé' })
      }

      const message = await Message.create({
        project: projectId,
        sender: req.user!.id,
        content: req.body.content,
        readBy: [req.user!.id],
      })

      // Mark all messages as read by this client user
      await Message.updateMany(
        { project: projectId, readBy: { $ne: req.user!.id } },
        { $addToSet: { readBy: req.user!.id } }
      )

      const populated = await message.populate('sender', 'name role')

      // Notifier les admins en charge du projet
      const populatedProject = await Project.findById(projectId).populate('assignedTo', '_id email name').populate('client', 'name')
      const clientName = (populatedProject?.client as any)?.name || req.user!.name || 'Le client'
      const projectName = populatedProject?.name || 'un projet'
      const adminBaseUrl = getAdminBaseUrl()
      const projectLink = `${adminBaseUrl}/projets/${projectId}`

      const recipientSet = new Set<string>()
      const recipientDocs: { _id: any; email: string }[] = []

      // Admin assigné
      const assigned = populatedProject?.assignedTo as any
      if (assigned?._id) recipientSet.add(assigned._id.toString())

      // Super admins
      const superAdmins = await User.find({ role: 'SUPER_ADMIN', isActive: { $ne: false } }).select('_id email')
      for (const sa of superAdmins) recipientSet.add(sa._id.toString())

      // Construire la liste finale
      for (const id of recipientSet) {
        const u = superAdmins.find((s) => s._id.toString() === id) || (assigned?._id?.toString() === id ? assigned : null)
        if (u?.email) recipientDocs.push({ _id: u._id, email: u.email })
      }

      const preview = req.body.content.slice(0, 120) + (req.body.content.length > 120 ? '…' : '')

      for (const recipient of recipientDocs) {
        createNotification({
          recipient: recipient._id,
          type: 'TASK_UPDATED',
          title: `Nouveau message client`,
          message: `${clientName} a envoyé un message sur "${projectName}" : ${preview}`,
          link: `/admin/projets/${projectId}`,
        }).catch(() => {})
      }

      // Respecter les préférences email de chaque destinataire
      const emailAllowed = await Promise.all(
        recipientDocs.map((r) => shouldNotify(String(r._id), 'TASK_UPDATED', 'email'))
      )
      const emailList = recipientDocs
        .filter((_, idx) => emailAllowed[idx])
        .map((r) => r.email)
        .filter(Boolean)
      if (emailList.length > 0) {
        const transporter = getTransporter()
        if (transporter) {
          const html = emailLayout({
            title: `Nouveau message de ${escapeHtml(clientName)}`,
            body: `<p>Bonjour,</p><p><strong>${escapeHtml(clientName)}</strong> a envoyé un message sur le projet <strong>${escapeHtml(projectName)}</strong> :</p><blockquote style="border-left:3px solid #0ea5e9;margin:12px 0;padding:8px 16px;color:rgba(255,255,255,0.8);font-style:italic">${escapeHtml(preview)}</blockquote>`,
            ctaUrl: projectLink,
            ctaLabel: 'Voir le projet',
          })
          transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER || 'notifications@venio.paris',
            to: emailList,
            subject: `[Venio] Nouveau message de ${clientName} — ${projectName}`,
            text: `${clientName} a envoyé un message sur "${projectName}" :\n\n${preview}\n\nVoir le projet : ${projectLink}`,
            html,
          }).catch(() => {})
        }
      }

      return res.status(201).json({ message: populated })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/projects/:projectId/messages/read — mark all messages as read
router.post('/:projectId/messages/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { projectId } = req.params

    const project = await Project.findOne({ _id: projectId, client: req.user!.id })
    if (!project) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    await Message.updateMany(
      { project: projectId, readBy: { $ne: req.user!.id } },
      { $addToSet: { readBy: req.user!.id } }
    )

    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

export default router
