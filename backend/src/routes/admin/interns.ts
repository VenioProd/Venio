import express, { type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import bcrypt from 'bcryptjs'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import Intern from '../../models/Intern.js'
import ActivityReport from '../../models/ActivityReport.js'
import User from '../../models/User.js'
import { createNotification } from '../../lib/notifications.js'
import { provisionNextcloudIntern, deleteNextcloudUser } from '../../lib/nextcloud.js'
import { sendInternReportEmail, sendReportValidatedEmail } from '../../lib/email/templates/report.js'
import { getInternSettings } from '../../models/InternSettings.js'
import { getRecentLogs } from '../../automation/models/AutomationLog.js'

const router = express.Router()

// ── Upload config for activity reports ──
const uploadsDir = path.resolve('uploads/reports')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const conventionsDir = path.resolve('uploads/conventions')
if (!fs.existsSync(conventionsDir)) fs.mkdirSync(conventionsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${safeName}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

const conventionStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, conventionsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${safeName}`)
  },
})
const uploadConvention = multer({ storage: conventionStorage, limits: { fileSize: 20 * 1024 * 1024 } })

// Serve uploaded files (pas d'auth — noms de fichiers non devinables)
router.get('/reports/files/:filename', (req: Request, res: Response) => {
  const filePath = path.resolve(uploadsDir, req.params.filename as string)
  if (!filePath.startsWith(uploadsDir)) return res.status(403).json({ error: 'Access denied' })
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' })
  res.sendFile(filePath)
})

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
        const daysSinceLastReport = lastActivity
          ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
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
        const daysSinceLastReport = lastActivity
          ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
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
      console.warn(`[Nextcloud] Provisioning échoué pour ${name}: ${ncResult.error}`)
    }

    const populated = await Intern.findById(intern._id)
      .populate('userId', 'name email phone lastLoginAt')
      .populate('tuteur', 'name email')

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

    if (type !== undefined && ['STAGIAIRE', 'ALTERNANT'].includes(type)) intern.type = type
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

// ═══════════════════════════════════════════════════
// PARTIE 2 — Rapports d'activite (stagiaires + admins)
// ═══════════════════════════════════════════════════

// GET /api/admin/interns/reports/all — tous les rapports (admin)
router.get('/reports/all', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { internId, date, status } = req.query
    const filter: Record<string, unknown> = {}
    if (internId) filter.internId = internId
    if (status) filter.status = status
    if (date) {
      const d = new Date(date as string)
      filter.date = {
        $gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        $lt: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
      }
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

// GET /api/admin/interns/reports/mine — mes rapports (tous les admins)
router.get('/reports/mine', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user

    // Chercher ou creer automatiquement une fiche intern pour cet admin
    let intern = await Intern.findOne({ userId: user.id })
    if (!intern) {
      intern = await Intern.create({
        userId: user.id,
        poste: user.role || 'Admin',
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

    // Trouver ou creer la fiche intern
    let intern = await Intern.findOne({ userId: user.id })

    // Si admin, il peut creer pour un stagiaire specifique via internId
    if (!intern && req.body.internId) {
      intern = await Intern.findById(req.body.internId)
    }

    // Auto-creation pour les admins sans fiche
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
        type: 'TASK_UPDATED',
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

    // Le stagiaire peut modifier si pas encore valide
    if (isOwner && !isAdmin && report.status === 'VALIDE') {
      return res.status(403).json({ error: 'Rapport deja valide, modification interdite' })
    }

    const { contenu, taches, status, commentaireAdmin } = req.body

    if (contenu !== undefined) report.contenu = contenu
    if (taches !== undefined) {
      try { report.taches = JSON.parse(taches) } catch { report.taches = [taches] }
    }

    // Admin peut valider ou commenter
    if (isAdmin) {
      if (status !== undefined) {
        report.status = status
        if (status === 'VALIDE') {
          report.validePar = user.id
          report.valideAt = new Date()
          // Notifier et emailer l'auteur que son rapport a ete valide
          if (report.userId.toString() !== user.id) {
            createNotification({
              recipient: report.userId,
              type: 'TASK_UPDATED',
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
        // Notifier l'auteur du commentaire
        if (commentaireAdmin && report.userId.toString() !== user.id) {
          createNotification({
            recipient: report.userId,
            type: 'TASK_UPDATED',
            title: 'Commentaire sur votre rapport',
            message: `${user.name} a commente votre rapport du ${new Date(report.date).toLocaleDateString('fr-FR')}`,
            link: '/admin/mes-rapports',
          }).catch(() => {})
        }
      }
    }

    // Ajout de nouveaux fichiers
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

    // Supprimer les fichiers
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

// ── Paramètres notifications rapports ──

// GET /api/admin/interns/settings/report-notifs
router.get('/settings/report-notifs', requireAdmin, async (req: Request, res: Response) => {
  try {
    const settings = await getInternSettings()
    const populated = await settings.populate('reportNotifRecipients', 'name email role')
    res.json({ recipients: (populated.reportNotifRecipients as any[]) })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PATCH /api/admin/interns/settings/report-notifs
router.patch('/settings/report-notifs', requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Non autorisé' })
    const { recipientIds } = req.body
    if (!Array.isArray(recipientIds)) return res.status(400).json({ error: 'recipientIds requis' })
    const settings = await getInternSettings()
    settings.reportNotifRecipients = recipientIds
    await settings.save()
    const populated = await settings.populate('reportNotifRecipients', 'name email role')
    res.json({ recipients: (populated.reportNotifRecipients as any[]) })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/admin/interns/send-reminders — déclencher manuellement les rappels (bypass idempotency)
router.post('/send-reminders', requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Non autorisé' })
    const { buildContext } = await import('../../automation/engine.js')
    const { getAutomation } = await import('../../automation/registry.js')
    const { createExecutionLog } = await import('../../automation/models/AutomationLog.js')
    const definition = getAutomation('intern.report_reminder')
    if (!definition) return res.status(404).json({ error: 'Automation introuvable' })
    // Use a unique key with timestamp to bypass the daily idempotency lock
    const ctx = { ...buildContext(), dateKey: `manual:${Date.now()}` }
    const startedAt = new Date()
    const result = await definition.execute(ctx)
    await createExecutionLog({
      automationKey: definition.key,
      executionType: 'cron',
      triggerSource: 'manual_trigger',
      idempotencyKey: ctx.dateKey,
      status: 'SUCCESS',
      startedAt,
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      actionsExecuted: result.actionsExecuted,
      recipientsNotified: result.recipientsNotified,
    })
    res.json({ success: true, actionsExecuted: result.actionsExecuted, recipientsNotified: result.recipientsNotified })
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/interns/reminder-logs — logs des rappels envoyés
router.get('/reminder-logs', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const logs = await getRecentLogs('intern.report_reminder', 30)
    res.json({ logs })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
