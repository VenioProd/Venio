import express, { type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import auth from '../../../middleware/auth.js'
import Intern from '../../../models/Intern.js'
import ActivityReport from '../../../models/ActivityReport.js'
import User from '../../../models/User.js'
import { createNotification } from '../../../lib/notifications.js'
import { syncUploadToNextcloud } from '../../../lib/nextcloud.js'
import { sendInternReportEmail, sendReportValidatedEmail } from '../../../lib/email/templates/report.js'
import { getInternSettings } from '../../../models/InternSettings.js'

const router = express.Router()

// ── Upload config for activity reports ──
const uploadsDir = path.resolve('uploads/reports')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${safeName}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

// Serve uploaded files (pas d'auth — noms de fichiers non devinables)
router.get('/reports/files/:filename', (req: Request, res: Response) => {
  const filePath = path.resolve(uploadsDir, req.params.filename as string)
  if (!filePath.startsWith(uploadsDir)) return res.status(403).json({ error: 'Access denied' })
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' })
  res.sendFile(filePath)
})

// Auth requis pour les autres routes de ce router
router.use(auth)

// GET /api/admin/interns/reports/all — tous les rapports (admin)
router.get('/reports/all', async (req: Request, res: Response) => {
  try {
    const { internId, date, status } = req.query
    const filter: Record<string, unknown> = {}
    if (status) filter.status = status
    if (date) {
      const d = new Date(date as string)
      filter.date = {
        $gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        $lt: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
      }
    }

    if (internId) {
      filter.internId = internId
    } else {
      // Restreindre aux vrais stagiaires/alternants (exclut les admins auto-créés)
      const stagiaires = await User.find({ role: 'STAGIAIRE' }).select('_id')
      const stagiaireIds = stagiaires.map((u) => u._id)
      const validInterns = await Intern.find({ userId: { $in: stagiaireIds } }).select('_id')
      filter.internId = { $in: validInterns.map((i) => i._id) }
    }

    const reports = await ActivityReport.find(filter)
      .populate('userId', 'name email')
      .populate('validePar', 'name')
      .sort({ date: -1, createdAt: -1 })
    res.json(reports)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/interns/reports/mine — mes rapports (stagiaires uniquement)
router.get('/reports/mine', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user

    let intern = await Intern.findOne({ userId: user.id })

    if (!intern) {
      if (user.role !== 'STAGIAIRE') {
        return res.json([])
      }
      intern = await Intern.create({
        userId: user.id,
        poste: 'Stagiaire',
        dateDebut: new Date(),
        dateFin: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
        createdBy: user.id,
      })
    }

    const reports = await ActivityReport.find({ internId: intern._id })
      .populate('validePar', 'name')
      .sort({ date: -1 })
    res.json(reports)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/admin/interns/reports — creer un rapport (le stagiaire ou un admin)
router.post('/reports', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { date, contenu, taches } = req.body
    if (!contenu) return res.status(400).json({ error: 'Le contenu est requis' })

    let intern = await Intern.findOne({ userId: user.id })

    if (!intern && req.body.internId) {
      intern = await Intern.findById(req.body.internId)
    }

    if (!intern) {
      intern = await Intern.create({
        userId: user.id,
        poste: user.role || 'Admin',
        dateDebut: new Date(),
        dateFin: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
        createdBy: user.id,
      })
    }

    const reportDate = date ? new Date(date) : new Date()

    const files = (req.files as Express.Multer.File[]) || []
    const attachments = files.map((f) => ({
      filename: f.filename,
      originalName: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
    }))

    let parsedTaches: string[] = []
    if (taches) {
      try { parsedTaches = JSON.parse(taches) } catch { parsedTaches = [taches] }
    }

    const report = await ActivityReport.create({
      internId: intern._id,
      userId: user.id,
      date: reportDate,
      contenu,
      taches: parsedTaches,
      attachments,
    })

    // Notifier les destinataires configurés (ou SUPER_ADMIN par défaut)
    const internSettings = await getInternSettings()
    const recipientIds: string[] = internSettings.reportNotifRecipients.map((id: any) => id.toString())
    let recipients: { _id: any; email: string }[] = []
    if (recipientIds.length > 0) {
      recipients = await User.find({ _id: { $in: recipientIds }, isActive: { $ne: false } }).select('_id email')
    } else {
      recipients = await User.find({ role: 'SUPER_ADMIN', isActive: { $ne: false } }).select('_id email')
    }
    const emailRecipients: string[] = []
    for (const recipient of recipients) {
      if (recipient._id.toString() === user.id) continue
      createNotification({
        recipient: recipient._id,
        type: 'INTERN_REPORT_SUBMITTED',
        title: `Nouveau rapport d'activite`,
        message: `${user.name} a soumis un rapport pour le ${new Date(reportDate).toLocaleDateString('fr-FR')}`,
        link: '/admin/stagiaires',
      }).catch(() => {})
      if (recipient.email) emailRecipients.push(recipient.email)
    }
    if (emailRecipients.length > 0) {
      sendInternReportEmail({
        to: emailRecipients,
        internName: user.name,
        internType: (intern.type || 'STAGIAIRE') as 'STAGIAIRE' | 'ALTERNANT',
        reportDate: new Date(reportDate).toLocaleDateString('fr-FR'),
        poste: intern.poste,
        contenu,
        tachesCount: parsedTaches.length,
        attachmentsCount: attachments.length,
      }).catch(() => {})
    }

    files.forEach(f => syncUploadToNextcloud(f, 'rapports', intern._id.toString()))

    res.status(201).json(report)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PATCH /api/admin/interns/reports/:id — modifier un rapport
router.patch('/reports/:id', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const report = await ActivityReport.findById(req.params.id)
    if (!report) return res.status(404).json({ error: 'Rapport introuvable' })

    const isOwner = report.userId.toString() === user.id
    const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN'

    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Non autorise' })

    if (isOwner && !isAdmin && report.status === 'VALIDE') {
      return res.status(403).json({ error: 'Rapport deja valide, modification interdite' })
    }

    const { contenu, taches, status, commentaireAdmin } = req.body

    if (contenu !== undefined) report.contenu = contenu
    if (taches !== undefined) {
      try { report.taches = JSON.parse(taches) } catch { report.taches = [taches] }
    }

    if (isAdmin) {
      if (status !== undefined) {
        report.status = status
        if (status === 'VALIDE') {
          report.validePar = user.id
          report.valideAt = new Date()
          if (report.userId.toString() !== user.id) {
            createNotification({
              recipient: report.userId,
              type: 'INTERN_REPORT_UPDATED',
              title: 'Rapport valide',
              message: `${user.name} a valide votre rapport du ${new Date(report.date).toLocaleDateString('fr-FR')}`,
              link: '/admin/mes-rapports',
            }).catch(() => {})
            const reportAuthor = await User.findById(report.userId).select('email name')
            if (reportAuthor?.email) {
              const authorIntern = await Intern.findOne({ userId: report.userId }).select('type')
              sendReportValidatedEmail({
                to: reportAuthor.email,
                internName: reportAuthor.name,
                internType: (authorIntern?.type || 'STAGIAIRE') as 'STAGIAIRE' | 'ALTERNANT',
                reportDate: new Date(report.date).toLocaleDateString('fr-FR'),
                adminName: user.name,
                commentaire: commentaireAdmin,
              }).catch(() => {})
            }
          }
        }
      }
      if (commentaireAdmin !== undefined) {
        report.commentaireAdmin = commentaireAdmin
        if (commentaireAdmin && report.userId.toString() !== user.id) {
          createNotification({
            recipient: report.userId,
            type: 'INTERN_REPORT_UPDATED',
            title: 'Commentaire sur votre rapport',
            message: `${user.name} a commente votre rapport du ${new Date(report.date).toLocaleDateString('fr-FR')}`,
            link: '/admin/mes-rapports',
          }).catch(() => {})
        }
      }
    }

    const files = (req.files as Express.Multer.File[]) || []
    if (files.length > 0) {
      const newAttachments = files.map((f) => ({
        filename: f.filename,
        originalName: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
      }))
      report.attachments.push(...newAttachments)
    }

    await report.save()
    res.json(report)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// DELETE /api/admin/interns/reports/:id — supprimer un rapport
router.delete('/reports/:id', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const report = await ActivityReport.findById(req.params.id)
    if (!report) return res.status(404).json({ error: 'Rapport introuvable' })

    const isOwner = report.userId.toString() === user.id
    const isAdmin = user.role === 'SUPER_ADMIN'

    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Non autorise' })

    for (const f of report.attachments) {
      const filePath = path.join(uploadsDir, f.filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }

    await ActivityReport.findByIdAndDelete(req.params.id)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
