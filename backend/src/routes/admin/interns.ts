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
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } })

// Serve uploaded files (pas d'auth — noms de fichiers non devinables)
router.get('/reports/files/:filename', (req: Request, res: Response) => {
  const filePath = path.resolve(uploadsDir, req.params.filename as string)
  if (!filePath.startsWith(uploadsDir)) return res.status(403).json({ error: 'Access denied' })
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

    const interns = await Intern.find(filter)
      .populate('userId', 'name email phone')
      .populate('tuteur', 'name email')
      .populate('createdBy', 'name')
      .sort({ dateDebut: -1 })
    res.json(interns)
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

    const { name, email, phone, poste, departement, dateDebut, dateFin, tuteur, ecole, formation, notes, password } = req.body
    if (!name || !email || !poste || !dateDebut || !dateFin) {
      return res.status(400).json({ error: 'Champs requis : nom, email, poste, date debut, date fin' })
    }

    // Verifier si l'email existe deja
    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing) {
      return res.status(400).json({ error: 'Cet email est deja utilise' })
    }

    // Creer le compte User avec role VIEWER (acces minimal)
    const passwordHash = await bcrypt.hash(password || 'Stage2026!', 10)
    const newUser = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      role: 'VIEWER',
      name,
      phone: phone || '',
    })

    // Creer la fiche stagiaire
    const intern = await Intern.create({
      userId: newUser._id,
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

    const populated = await Intern.findById(intern._id)
      .populate('userId', 'name email phone')
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

    const { poste, departement, dateDebut, dateFin, tuteur, ecole, formation, notes, status } = req.body

    if (poste !== undefined) intern.poste = poste
    if (departement !== undefined) intern.departement = departement
    if (dateDebut !== undefined) intern.dateDebut = new Date(dateDebut)
    if (dateFin !== undefined) intern.dateFin = new Date(dateFin)
    if (tuteur !== undefined) intern.tuteur = tuteur || null
    if (ecole !== undefined) intern.ecole = ecole
    if (formation !== undefined) intern.formation = formation
    if (notes !== undefined) intern.notes = notes
    if (status !== undefined) intern.status = status

    await intern.save()

    const populated = await Intern.findById(intern._id)
      .populate('userId', 'name email phone')
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

    // Notifier les SUPER_ADMIN qu'un rapport a ete soumis
    const superAdmins = await User.find({ role: 'SUPER_ADMIN' }).select('_id')
    for (const admin of superAdmins) {
      if (admin._id.toString() === user.id) continue
      createNotification({
        recipient: admin._id,
        type: 'TASK_UPDATED',
        title: `Nouveau rapport d'activite`,
        message: `${user.name} a soumis un rapport pour le ${new Date(reportDate).toLocaleDateString('fr-FR')}`,
        link: '/admin/stagiaires',
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
          // Notifier l'auteur que son rapport a ete valide
          if (report.userId.toString() !== user.id) {
            createNotification({
              recipient: report.userId,
              type: 'TASK_UPDATED',
              title: 'Rapport valide',
              message: `${user.name} a valide votre rapport du ${new Date(report.date).toLocaleDateString('fr-FR')}`,
              link: '/admin/mes-rapports',
            }).catch(() => {})
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

export default router
