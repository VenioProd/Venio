import express, { type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import auth from '../../../middleware/auth.js'
import { requireAdmin } from '../../../middleware/role.js'
import Intern from '../../../models/Intern.js'
import ActivityReport from '../../../models/ActivityReport.js'
import User from '../../../models/User.js'
import { createNotification } from '../../../lib/notifications.js'
import { notifySuperAdmins } from '../../../lib/notifyHelpers.js'
import { provisionNextcloudIntern, deleteNextcloudUser, syncUploadToNextcloud } from '../../../lib/nextcloud.js'
import { sendAdminCredentials } from '../../../lib/email.js'
import { countWorkingDaysSince } from '../../../lib/workingDays.js'
import logger from '../../../lib/logger.js'

const router = express.Router()

// ── Upload config for activity reports ──
const uploadsDir = path.resolve('uploads/reports')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const conventionsDir = path.resolve('uploads/conventions')
if (!fs.existsSync(conventionsDir)) fs.mkdirSync(conventionsDir, { recursive: true })


const conventionStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, conventionsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${safeName}`)
  },
})
const uploadConvention = multer({ storage: conventionStorage, limits: { fileSize: 20 * 1024 * 1024 } })

// Serve uploaded files (pas d'auth — noms de fichiers non devinables)

// Serve convention files
router.get('/conventions/files/:filename', (req: Request, res: Response) => {
  const filePath = path.resolve(conventionsDir, req.params.filename as string)
  if (!filePath.startsWith(conventionsDir)) return res.status(403).json({ error: 'Access denied' })
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' })
  res.sendFile(filePath)
})

// Auth requis pour toutes les autres routes
router.use(auth)

// ═══════════════════════════════════════════════════
// PARTIE 1 — Gestion des stagiaires (admin only)
// ═══════════════════════════════════════════════════

// GET /api/admin/interns — liste des stagiaires
router.get('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status } = req.query
    const filter: Record<string, unknown> = {}
    if (status) filter.status = status

    const interns = await Intern.find({ ...filter, inclureEquipe: { $ne: false } })
      .populate('userId', 'name email phone lastLoginAt')
      .populate('tuteur', 'name email')
      .populate('createdBy', 'name')
      .sort({ dateDebut: -1 })
    res.json(interns)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/interns/documents — tous les fichiers uploades par les stagiaires
router.get('/documents', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { internId, type, sort } = req.query

    const reportFilter: Record<string, unknown> = {}
    if (internId) reportFilter.internId = internId

    // Recuperer tous les rapports qui ont des fichiers
    const reports = await ActivityReport.find({
      ...reportFilter,
      'attachments.0': { $exists: true },
    })
      .populate('userId', 'name email')
      .populate('internId', 'userId poste')
      .sort({ date: -1 })

    // Aplatir : un item par fichier
    const documents: any[] = []
    for (const report of reports) {
      for (const file of report.attachments) {
        const ext = file.originalName.split('.').pop()?.toLowerCase() || ''
        const fileType = getFileType(file.mimetype, ext)

        // Filtre par type
        if (type && type !== 'all' && fileType !== type) continue

        documents.push({
          _id: `${report._id}-${file.filename}`,
          filename: file.filename,
          originalName: file.originalName,
          mimetype: file.mimetype,
          size: file.size,
          fileType,
          reportId: report._id,
          reportDate: report.date,
          reportStatus: report.status,
          uploadedAt: report.createdAt,
          user: report.userId,
          intern: report.internId,
        })
      }
    }

    // Tri
    if (sort === 'name') {
      documents.sort((a, b) => a.originalName.localeCompare(b.originalName))
    } else if (sort === 'size') {
      documents.sort((a, b) => b.size - a.size)
    } else if (sort === 'type') {
      documents.sort((a, b) => a.fileType.localeCompare(b.fileType))
    }
    // Par defaut : tri par date desc (deja fait par le query)

    // Stats par type
    const allDocs = documents // deja filtre par internId si fourni
    const stats = {
      total: allDocs.length,
      totalSize: allDocs.reduce((s, d) => s + d.size, 0),
      byType: {} as Record<string, number>,
    }
    allDocs.forEach((d) => { stats.byType[d.fileType] = (stats.byType[d.fileType] || 0) + 1 })

    res.json({ documents, stats })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

function getFileType(mimetype: string, ext: string): string {
  if (mimetype.startsWith('image/')) return 'image'
  if (mimetype === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mimetype.includes('word') || ext === 'doc' || ext === 'docx') return 'document'
  if (mimetype.includes('sheet') || mimetype.includes('excel') || ext === 'xls' || ext === 'xlsx') return 'tableur'
  if (mimetype.includes('presentation') || ext === 'pptx' || ext === 'ppt') return 'presentation'
  if (mimetype.startsWith('video/')) return 'video'
  if (mimetype.startsWith('audio/')) return 'audio'
  if (mimetype === 'application/zip' || ext === 'zip') return 'archive'
  return 'autre'
}

// GET /api/admin/interns/kpis — KPIs detailles pour tous les stagiaires
router.get('/kpis', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status: filterStatus } = req.query
    const filter: Record<string, unknown> = {}
    if (filterStatus) filter.status = filterStatus
    else filter.status = 'ACTIF'

    const interns = await Intern.find(filter)
      .populate('userId', 'name email phone lastLoginAt')
      .populate('tuteur', 'name')
      .sort({ dateDebut: -1 })

    const now = new Date()
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000)

    const kpis = await Promise.all(
      interns.map(async (intern) => {
        // Tous les rapports
        const allReports = await ActivityReport.find({ internId: intern._id }).sort({ date: -1 })
        const recentReports = allReports.filter((r) => new Date(r.date) >= fourWeeksAgo)

        const totalReports = allReports.length
        const validated = allReports.filter((r) => r.status === 'VALIDE').length
        const pending = allReports.filter((r) => r.status === 'SOUMIS').length
        const drafts = allReports.filter((r) => r.status === 'BROUILLON').length

        // Taches totales
        const totalTaches = allReports.reduce((sum, r) => sum + r.taches.length, 0)
        const totalAttachments = allReports.reduce((sum, r) => sum + r.attachments.length, 0)

        // Derniere activite
        const lastReport = allReports[0] || null
        const lastActivity = lastReport?.date || null
        const joursP = Array.isArray(intern.joursPresence) && intern.joursPresence.length > 0
          ? intern.joursPresence as string[]
          : ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']
        const daysSinceLastReport = lastActivity
          ? countWorkingDaysSince(new Date(lastActivity), now, joursP)
          : null

        // Progression du stage
        const totalDays = Math.ceil((new Date(intern.dateFin).getTime() - new Date(intern.dateDebut).getTime()) / (1000 * 60 * 60 * 24))
        const elapsedDays = Math.max(0, Math.ceil((now.getTime() - new Date(intern.dateDebut).getTime()) / (1000 * 60 * 60 * 24)))
        const daysRemaining = Math.max(0, Math.ceil((new Date(intern.dateFin).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        const progress = totalDays > 0 ? Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100))) : 0

        // Regularite : combien de jours distincts ont un rapport sur les 4 dernieres semaines
        const uniqueReportDays = new Set(
          recentReports.map((r) => new Date(r.date).toISOString().split('T')[0])
        ).size
        // Jours ouvres approximatifs sur 4 semaines = 20
        const regularite = Math.min(100, Math.round((uniqueReportDays / 20) * 100))

        // Breakdown hebdomadaire (4 dernieres semaines)
        const weeks: { weekLabel: string; reports: number; taches: number; validated: number }[] = []
        for (let w = 0; w < 4; w++) {
          const weekStart = new Date(now.getTime() - (w + 1) * 7 * 24 * 60 * 60 * 1000)
          const weekEnd = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000)
          const weekReports = allReports.filter((r) => {
            const d = new Date(r.date)
            return d >= weekStart && d < weekEnd
          })
          const startStr = weekStart.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
          const endStr = weekEnd.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
          weeks.unshift({
            weekLabel: `${startStr} - ${endStr}`,
            reports: weekReports.length,
            taches: weekReports.reduce((s, r) => s + r.taches.length, 0),
            validated: weekReports.filter((r) => r.status === 'VALIDE').length,
          })
        }

        return {
          intern: {
            _id: intern._id,
            name: (intern.userId as any)?.name || '',
            email: (intern.userId as any)?.email || '',
            poste: intern.poste,
            departement: intern.departement,
            dateDebut: intern.dateDebut,
            dateFin: intern.dateFin,
            tuteur: (intern.tuteur as any)?.name || null,
            ecole: intern.ecole,
            status: intern.status,
          },
          kpis: {
            totalReports,
            validated,
            pending,
            drafts,
            validationRate: totalReports > 0 ? Math.round((validated / totalReports) * 100) : 0,
            totalTaches,
            totalAttachments,
            lastActivity,
            daysSinceLastReport,
            regularite,
            progress,
            daysRemaining,
            totalDays,
            elapsedDays,
          },
          weeks,
        }
      })
    )

    res.json(kpis)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/interns/stats
router.get('/stats', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [actifs, termines, total] = await Promise.all([
      Intern.countDocuments({ status: 'ACTIF' }),
      Intern.countDocuments({ status: 'TERMINE' }),
      Intern.countDocuments(),
    ])
    res.json({ actifs, termines, total })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/interns/dashboard — tableau de bord global
router.get('/dashboard', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const interns = await Intern.find({ status: 'ACTIF', inclureEquipe: { $ne: false } })
      .populate('userId', 'name email phone lastLoginAt')
      .populate('tuteur', 'name email')
      .sort({ dateDebut: -1 })

    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const dashboard = await Promise.all(
      interns.map(async (intern) => {
        const [totalReports, reportsThisWeek, validatedReports, lastReport] = await Promise.all([
          ActivityReport.countDocuments({ internId: intern._id }),
          ActivityReport.countDocuments({ internId: intern._id, date: { $gte: weekAgo } }),
          ActivityReport.countDocuments({ internId: intern._id, status: 'VALIDE' }),
          ActivityReport.findOne({ internId: intern._id }).sort({ date: -1 }).select('date status'),
        ])

        const lastActivity = lastReport?.date || null
        const joursP2 = Array.isArray(intern.joursPresence) && intern.joursPresence.length > 0
          ? intern.joursPresence as string[]
          : ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']
        const daysSinceLastReport = lastActivity
          ? countWorkingDaysSince(new Date(lastActivity), now, joursP2)
          : null

        const totalDays = Math.ceil((new Date(intern.dateFin).getTime() - new Date(intern.dateDebut).getTime()) / (1000 * 60 * 60 * 24))
        const elapsedDays = Math.ceil((now.getTime() - new Date(intern.dateDebut).getTime()) / (1000 * 60 * 60 * 24))
        const progress = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)))
        const daysRemaining = Math.max(0, Math.ceil((new Date(intern.dateFin).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))

        return {
          intern: {
            _id: intern._id,
            userId: intern.userId,
            type: intern.type,
            poste: intern.poste,
            departement: intern.departement,
            dateDebut: intern.dateDebut,
            dateFin: intern.dateFin,
            tuteur: intern.tuteur,
            ecole: intern.ecole,
            formation: intern.formation,
            status: intern.status,
            joursPresence: intern.joursPresence,
          },
          stats: {
            totalReports,
            reportsThisWeek,
            validatedReports,
            validationRate: totalReports > 0 ? Math.round((validatedReports / totalReports) * 100) : 0,
            lastActivity,
            daysSinceLastReport,
            progress,
            daysRemaining,
            totalDays,
            elapsedDays,
          },
        }
      })
    )

    // Trier : les plus inactifs en premier (alerte)
    dashboard.sort((a, b) => {
      const aDays = a.stats.daysSinceLastReport ?? 999
      const bDays = b.stats.daysSinceLastReport ?? 999
      return bDays - aDays
    })

    res.json(dashboard)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/interns/:id/detail — fiche stagiaire complete
router.get('/:id/detail', requireAdmin, async (req: Request, res: Response) => {
  try {
    const intern = await Intern.findById(req.params.id)
      .populate('userId', 'name email phone lastLoginAt')
      .populate('tuteur', 'name email')
      .populate('createdBy', 'name')
    if (!intern) return res.status(404).json({ error: 'Stagiaire introuvable' })

    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [totalReports, reportsThisWeek, validatedReports, pendingReports, reports] = await Promise.all([
      ActivityReport.countDocuments({ internId: intern._id }),
      ActivityReport.countDocuments({ internId: intern._id, date: { $gte: weekAgo } }),
      ActivityReport.countDocuments({ internId: intern._id, status: 'VALIDE' }),
      ActivityReport.countDocuments({ internId: intern._id, status: 'SOUMIS' }),
      ActivityReport.find({ internId: intern._id })
        .populate('validePar', 'name')
        .sort({ date: -1 })
        .limit(50),
    ])

    const lastReport = reports[0] || null
    const lastActivity = lastReport?.date || null
    const daysSinceLastReport = lastActivity
      ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
      : null

    const totalDays = Math.ceil((new Date(intern.dateFin).getTime() - new Date(intern.dateDebut).getTime()) / (1000 * 60 * 60 * 24))
    const elapsedDays = Math.ceil((now.getTime() - new Date(intern.dateDebut).getTime()) / (1000 * 60 * 60 * 24))
    const progress = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)))
    const daysRemaining = Math.max(0, Math.ceil((new Date(intern.dateFin).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))

    res.json({
      intern,
      stats: {
        totalReports,
        reportsThisWeek,
        validatedReports,
        pendingReports,
        validationRate: totalReports > 0 ? Math.round((validatedReports / totalReports) * 100) : 0,
        lastActivity,
        daysSinceLastReport,
        progress,
        daysRemaining,
        totalDays,
        elapsedDays,
      },
      reports,
    })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/interns/:id
router.get('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const intern = await Intern.findById(req.params.id)
      .populate('userId', 'name email phone')
      .populate('tuteur', 'name email')
    if (!intern) return res.status(404).json({ error: 'Stagiaire introuvable' })
    res.json(intern)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/admin/interns — creer un stagiaire (cree aussi le compte User)
router.post('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Non autorise' })
    }

    const { name, email, phone, poste, departement, dateDebut, dateFin, tuteur, ecole, formation, notes, password, type } = req.body
    if (!name || !email || !poste || !dateDebut || !dateFin) {
      return res.status(400).json({ error: 'Champs requis : nom, email, poste, date debut, date fin' })
    }

    // Verifier si l'email existe deja
    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing) {
      return res.status(400).json({ error: 'Cet email est deja utilise' })
    }

    // Creer le compte User avec role ADMIN + tag STAGIAIRE ou ALTERNANT
    const internType: 'STAGIAIRE' | 'ALTERNANT' = type === 'ALTERNANT' ? 'ALTERNANT' : 'STAGIAIRE'
    const passwordHash = await bcrypt.hash(password || 'Stage2026!', 10)
    const newUser = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      role: 'ADMIN',
      name,
      phone: phone || '',
      tags: [internType],
    })

    // Creer la fiche stagiaire/alternant
    const intern = await Intern.create({
      userId: newUser._id,
      type: internType,
      poste,
      departement: departement || '',
      dateDebut: new Date(dateDebut),
      dateFin: new Date(dateFin),
      tuteur: tuteur || null,
      ecole: ecole || '',
      formation: formation || '',
      notes: notes || '',
      createdBy: user.id,
    })

    // Provisioner un compte Nextcloud pour le stagiaire (si configuré)
    const ncResult = await provisionNextcloudIntern(name, email.toLowerCase())
    if (ncResult.success && ncResult.username) {
      await Intern.findByIdAndUpdate(intern._id, {
        nextcloudUsername: ncResult.username,
        nextcloudPassword: ncResult.password,
      })
    } else if (!ncResult.success && ncResult.error && !ncResult.error.includes('non configurés')) {
      logger.warn(`[Nextcloud] Provisioning échoué pour ${name}: ${ncResult.error}`)
    }

    const populated = await Intern.findById(intern._id)
      .populate('userId', 'name email phone lastLoginAt')
      .populate('tuteur', 'name email')

    // Notifier les super admins (sauf le créateur) et le tuteur le cas échéant
    notifySuperAdmins({
      type: 'INTERN_CREATED',
      title: `Nouveau ${internType.toLowerCase()}`,
      message: `${name} (${poste}) rejoint l'équipe`,
      link: '/admin/stagiaires',
      metadata: { internId: String(intern._id) },
      excludeUserId: user.id,
    }).catch(() => {})
    if (tuteur) {
      createNotification({
        recipient: tuteur,
        type: 'INTERN_CREATED',
        title: `Vous êtes tuteur de ${name}`,
        message: `${name} (${poste}) vous a été assigné`,
        link: '/admin/stagiaires',
        metadata: { internId: String(intern._id) },
      }).catch(() => {})
    }

    res.status(201).json(populated)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PATCH /api/admin/interns/:id — modifier un stagiaire
router.patch('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Non autorise' })
    }

    const intern = await Intern.findById(req.params.id)
    if (!intern) return res.status(404).json({ error: 'Stagiaire introuvable' })

    const { poste, departement, dateDebut, dateFin, tuteur, ecole, formation, notes, status, type, joursPresence } = req.body

    if (type !== undefined && ['STAGIAIRE', 'ALTERNANT'].includes(type)) {
      intern.type = type
      await User.findByIdAndUpdate(intern.userId, {
        $set: { tags: [type] },
      })
    }
    if (poste !== undefined) intern.poste = poste
    if (departement !== undefined) intern.departement = departement
    if (dateDebut !== undefined) intern.dateDebut = new Date(dateDebut)
    if (dateFin !== undefined) intern.dateFin = new Date(dateFin)
    if (tuteur !== undefined) intern.tuteur = tuteur || null
    if (ecole !== undefined) intern.ecole = ecole
    if (formation !== undefined) intern.formation = formation
    if (notes !== undefined) intern.notes = notes
    if (status !== undefined) intern.status = status
    if (Array.isArray(joursPresence)) intern.joursPresence = joursPresence
    if (req.body.inclureEquipe !== undefined) intern.inclureEquipe = Boolean(req.body.inclureEquipe)

    await intern.save()

    const populated = await Intern.findById(intern._id)
      .populate('userId', 'name email phone lastLoginAt')
      .populate('tuteur', 'name email')

    res.json(populated)
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// DELETE /api/admin/interns/:id — supprimer un stagiaire
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Seuls les super admins peuvent supprimer' })
    }

    const intern = await Intern.findById(req.params.id)
    if (!intern) return res.status(404).json({ error: 'Stagiaire introuvable' })

    // Supprimer le compte Nextcloud du stagiaire
    if ((intern as any).nextcloudUsername) {
      deleteNextcloudUser((intern as any).nextcloudUsername).catch(() => {})
    }

    // Supprimer les rapports associes et leurs fichiers
    const reports = await ActivityReport.find({ internId: intern._id })
    for (const report of reports) {
      for (const f of report.attachments) {
        const filePath = path.join(uploadsDir, f.filename)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      }
    }
    await ActivityReport.deleteMany({ internId: intern._id })
    await Intern.findByIdAndDelete(req.params.id)

    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/admin/interns/:id/resend-credentials — génère un nouveau mdp et envoie les identifiants par email
router.post('/:id/resend-credentials', requireAdmin, async (req: Request, res: Response) => {
  try {
    const reqUser = (req as any).user
    if (reqUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Seuls les super admins peuvent renvoyer les identifiants' })
    }

    const intern = await Intern.findById(req.params.id).populate('userId', 'name email')
    if (!intern || !intern.userId) return res.status(404).json({ error: 'Stagiaire introuvable' })

    const user = await User.findById((intern.userId as any)._id)
    if (!user) return res.status(404).json({ error: 'Compte utilisateur introuvable' })

    const tempPassword = crypto.randomBytes(6).toString('hex')
    user.passwordHash = await bcrypt.hash(tempPassword, 10)
    ;(user as any).passwordChangedAt = new Date()
    await user.save()

    const result = await sendAdminCredentials({
      to: user.email,
      name: user.name,
      email: user.email,
      password: tempPassword,
    })

    if (!result.sent) {
      return res.status(500).json({ error: result.error || 'Erreur lors de l\'envoi de l\'email.' })
    }

    // Notifier le stagiaire en in-app aussi (l'email peut être désactivé)
    createNotification({
      recipient: user._id,
      type: 'INTERN_CREDENTIALS_SENT',
      title: 'Nouveaux identifiants envoyés',
      message: `Un super admin a réinitialisé votre mot de passe — consultez votre email.`,
      link: '/admin/profile',
    }).catch(() => {})

    return res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})


// POST /api/admin/interns/:id/convention — ajouter une convention
router.post('/:id/convention', requireAdmin, uploadConvention.single('file'), async (req: Request, res: Response) => {
  try {
    const intern = await Intern.findById(req.params.id)
    if (!intern) return res.status(404).json({ error: 'Stagiaire introuvable' })

    const file = req.file
    if (!file) return res.status(400).json({ error: 'Aucun fichier reçu' })

    const newEntry = {
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      uploadedAt: new Date(),
    }

    await Intern.findByIdAndUpdate(req.params.id, { $push: { conventions: newEntry } })
    syncUploadToNextcloud(file, 'conventions', String(req.params.id))

    // Notifier le stagiaire qu'une convention a été ajoutée
    if (intern.userId) {
      createNotification({
        recipient: intern.userId,
        type: 'INTERN_CONVENTION_ADDED',
        title: 'Convention déposée',
        message: `Votre convention "${file.originalname}" a été ajoutée à votre dossier`,
        link: '/admin/profile',
      }).catch(() => {})
    }

    res.json({ ok: true, ...newEntry })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// DELETE /api/admin/interns/:id/convention/:filename — supprimer une convention spécifique
router.delete('/:id/convention/:filename', requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Non autorisé' })

    const intern = await Intern.findById(req.params.id)
    if (!intern) return res.status(404).json({ error: 'Stagiaire introuvable' })

    const filename = req.params.filename as string
    const filePath = path.join(conventionsDir, filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    await Intern.findByIdAndUpdate(req.params.id, { $pull: { conventions: { filename } } })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})


export default router
