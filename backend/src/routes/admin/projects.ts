import express, { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import Project from '../../models/Project.js'
import Task from '../../models/Task.js'
import MissionBrief from '../../models/MissionBrief.js'
import ProjectUpdate from '../../models/ProjectUpdate.js'
import User from '../../models/User.js'
import Document from '../../models/Document.js'
import { getNextSequence } from '../../models/Sequence.js'
import ActivityLog from '../../models/ActivityLog.js'
import { logActivity } from '../../lib/activityLog.js'
import { sendClientProjectUpdateEmail, sendProjectStatusEmail, sendProjectStartEmail, sendProjectCompleteEmail, sendDeliverableNotificationEmail } from '../../lib/email.js'
import { createNotification } from '../../lib/notifications.js'
import { generateProjectRecapPdf } from '../../lib/pdfProjectRecap.js'
import ProjectSection from '../../models/ProjectSection.js'
import { PERMISSIONS } from '../../lib/permissions.js'

const router = express.Router()

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
  'application/json',
])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`))
    }
  },
})

router.use(auth)
router.use(requireAdmin)

router.get('/', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user
    const filter: Record<string, unknown> = {}
    if (req.query.clientId) {
      filter.client = req.query.clientId
    }
    if (req.query.archived === 'all') {
      // no filter on isArchived
    } else if (req.query.archived === 'true') {
      filter.isArchived = true
    } else {
      filter.$or = [{ isArchived: false }, { isArchived: { $exists: false } }]
    }

    // Non-SUPER_ADMIN : projets assignés directement, ou via tâches/briefs
    if (user.role !== 'SUPER_ADMIN') {
      const [taskProjectIds, briefProjectIds, assignedProjectIds] = await Promise.all([
        Task.distinct('project', { assignee: user.id }),
        MissionBrief.distinct('project', { destinataire: user.id }),
        Project.distinct('_id', { assignedTo: user.id }),
      ])
      const allProjectIds = [...new Set([...taskProjectIds.map(String), ...briefProjectIds.map(String), ...assignedProjectIds.map(String)])]
      filter._id = { $in: allProjectIds }
    }

    const query = Project.find(filter).sort({ updatedAt: -1 }).populate('assignedTo', 'name email')
    if (req.query.includeClient === 'true') {
      query.populate('client', 'name email')
    }
    const projects = await query
    return res.json({ projects })
  } catch (err) {
    return next(err)
  }
})

router.get('/:id', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findById(req.params.id).populate('assignedTo', 'name email')
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }
    return res.json({ project })
  } catch (err) {
    return next(err)
  }
})

router.get('/:id/documents', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const documents = await Document.find({ project: req.params.id }).sort({ uploadedAt: -1 })
    return res.json({ documents })
  } catch (err) {
    return next(err)
  }
})

// GET /api/admin/projects/:id/activity — project activity timeline
router.get('/:id/activity', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit: limitStr, before: beforeStr } = req.query as Record<string, string | undefined>
    const limit = Math.min(Number(limitStr) || 30, 100)
    const before = beforeStr ? new Date(beforeStr) : null
    const filter: Record<string, unknown> = { project: req.params.id }
    if (before) filter.createdAt = { $lt: before }
    const activities = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actor', 'name email')
    return res.json({ activities })
  } catch (err) {
    return next(err)
  }
})

router.get('/:id/updates', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = await ProjectUpdate.find({ project: req.params.id }).sort({ createdAt: -1 })
    return res.json({ updates })
  } catch (err) {
    return next(err)
  }
})

function normalizeOptions(body: Record<string, any>): Record<string, any> {
  const opts: Record<string, any> = {}
  if (Array.isArray(body.serviceTypes)) {
    opts.serviceTypes = body.serviceTypes.filter((s: unknown) => typeof s === 'string' && (s as string).trim())
  }
  if (Array.isArray(body.deliverableTypes)) {
    opts.deliverableTypes = body.deliverableTypes.filter((s: unknown) => typeof s === 'string' && (s as string).trim())
  }
  if (Array.isArray(body.deadlines)) {
    opts.deadlines = body.deadlines
      .filter((d: any) => d && (d.label != null || d.dueAt != null))
      .map((d: any) => ({
        label: typeof d.label === 'string' ? d.label : '',
        dueAt: d.dueAt ? new Date(d.dueAt) : null,
      }))
  }
  if (body.budget && typeof body.budget === 'object') {
    const b = body.budget
    opts.budget = {
      amount: typeof b.amount === 'number' && !Number.isNaN(b.amount) ? b.amount : null,
      currency: typeof b.currency === 'string' ? (b.currency || 'EUR') : 'EUR',
      note: typeof b.note === 'string' ? b.note : '',
    }
  }
  if (body.startDate != null) opts.startDate = body.startDate ? new Date(body.startDate) : null
  if (body.endDate != null) opts.endDate = body.endDate ? new Date(body.endDate) : null
  if (body.deliveredAt != null) opts.deliveredAt = body.deliveredAt ? new Date(body.deliveredAt) : null
  if (body.projectNumber !== undefined) opts.projectNumber = typeof body.projectNumber === 'string' ? body.projectNumber : ''
  if (body.priority !== undefined && ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'].includes(body.priority)) opts.priority = body.priority
  if (body.responsible !== undefined) opts.responsible = typeof body.responsible === 'string' ? body.responsible : ''
  if (body.assignedTo !== undefined) opts.assignedTo = body.assignedTo || null
  if (body.internalNotes !== undefined) opts.internalNotes = typeof body.internalNotes === 'string' ? body.internalNotes : ''
  if (body.isArchived !== undefined) opts.isArchived = Boolean(body.isArchived)
  if (Array.isArray(body.tags)) opts.tags = body.tags.filter((s: unknown) => typeof s === 'string' && (s as string).trim())
  if (body.summary !== undefined) opts.summary = typeof body.summary === 'string' ? body.summary : ''
  if (body.reminderAt != null) opts.reminderAt = body.reminderAt ? new Date(body.reminderAt) : null
  if (body.billing && typeof body.billing === 'object') {
    const bil = body.billing
    opts.billing = {
      amountInvoiced: typeof bil.amountInvoiced === 'number' && !Number.isNaN(bil.amountInvoiced) ? bil.amountInvoiced : null,
      billingStatus: ['NON_FACTURE', 'PARTIEL', 'FACTURE'].includes(bil.billingStatus) ? bil.billingStatus : 'NON_FACTURE',
      quoteReference: typeof bil.quoteReference === 'string' ? bil.quoteReference : '',
    }
  }
  return opts
}

router.post('/', requirePermission(PERMISSIONS.EDIT_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientId, name, description, status } = req.body || {}
    if (!clientId || !name) {
      return res.status(400).json({ error: 'clientId and name are required' })
    }

    const client = await User.findById(clientId)
    if (!client || client.role !== 'CLIENT') {
      return res.status(400).json({ error: 'Invalid clientId' })
    }
    if (!['PROSPECT', 'ACTIF', 'EN_PAUSE'].includes(client.status || 'ACTIF')) {
      return res.status(422).json({ error: 'Client must be active before creating a project' })
    }

    const options = normalizeOptions(req.body || {})

    if (!options.projectNumber || String(options.projectNumber).trim() === '') {
      const { formatted } = await getNextSequence('projectNumber', { prefix: 'PROJ-', padding: 4 })
      options.projectNumber = formatted
    }

    const project = await Project.create({
      client: clientId,
      name,
      description: description || '',
      status: status || 'EN_COURS',
      ...options,
    })

    await logActivity({ project: project._id, action: 'PROJECT_CREATED', actor: req.user!.id, summary: `Projet "${name}" créé` })

    return res.status(201).json({ project })
  } catch (err) {
    return next(err)
  }
})

router.patch('/:id', requirePermission(PERMISSIONS.EDIT_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {}
    const { name, description, status } = body
    const update: Record<string, unknown> = {}
    if (name !== undefined) update.name = name
    if (description !== undefined) update.description = description
    if (status !== undefined) update.status = status

    const options = normalizeOptions(body)
    if (body.serviceTypes !== undefined) update.serviceTypes = options.serviceTypes !== undefined ? options.serviceTypes : body.serviceTypes
    if (body.deliverableTypes !== undefined) update.deliverableTypes = options.deliverableTypes !== undefined ? options.deliverableTypes : body.deliverableTypes
    if (body.deadlines !== undefined) update.deadlines = options.deadlines !== undefined ? options.deadlines : body.deadlines
    if (body.budget !== undefined) update.budget = options.budget !== undefined ? options.budget : body.budget
    if (body.startDate !== undefined) update.startDate = options.startDate !== undefined ? options.startDate : (body.startDate ? new Date(body.startDate) : null)
    if (body.endDate !== undefined) update.endDate = options.endDate !== undefined ? options.endDate : (body.endDate ? new Date(body.endDate) : null)
    if (body.deliveredAt !== undefined) update.deliveredAt = options.deliveredAt !== undefined ? options.deliveredAt : (body.deliveredAt ? new Date(body.deliveredAt) : null)
    if (body.projectNumber !== undefined) update.projectNumber = options.projectNumber !== undefined ? options.projectNumber : body.projectNumber
    if (body.priority !== undefined) update.priority = options.priority !== undefined ? options.priority : body.priority
    if (body.responsible !== undefined) update.responsible = options.responsible !== undefined ? options.responsible : body.responsible
    if (body.assignedTo !== undefined) update.assignedTo = body.assignedTo || null
    if (body.internalNotes !== undefined) update.internalNotes = options.internalNotes !== undefined ? options.internalNotes : body.internalNotes
    if (body.isArchived !== undefined) update.isArchived = options.isArchived !== undefined ? options.isArchived : body.isArchived
    if (body.tags !== undefined) update.tags = options.tags !== undefined ? options.tags : body.tags
    if (body.summary !== undefined) update.summary = options.summary !== undefined ? options.summary : body.summary
    if (body.reminderAt !== undefined) update.reminderAt = options.reminderAt !== undefined ? options.reminderAt : (body.reminderAt ? new Date(body.reminderAt) : null)
    if (body.billing !== undefined) update.billing = options.billing !== undefined ? options.billing : body.billing

    const oldProject = await Project.findById(req.params.id)
    const project = await Project.findByIdAndUpdate(req.params.id, update, {
      new: true,
    })
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }

    // Log activity for meaningful changes
    if (oldProject) {
      if (update.status && update.status !== oldProject.status) {
        await logActivity({ project: project._id, action: 'STATUS_CHANGED', actor: req.user!.id, summary: `Statut changé de ${oldProject.status} à ${update.status}`, metadata: { from: oldProject.status, to: update.status } })
        // Email client about status change
        const client = await User.findById(project.client)
        if (client?.email) {
          const clientBaseUrl = process.env.CLIENT_URL || 'http://localhost:5501/espace-client'
          const portalUrl = `${clientBaseUrl}/projects/${project._id}`

          sendProjectStatusEmail({
            to: client.email,
            recipientName: client.name || client.email,
            projectName: project.name,
            oldStatus: oldProject.status,
            newStatus: update.status as string,
            projectId: String(project._id),
          }).catch(() => {})

          // Send specific start/complete emails
          if (update.status === 'EN_COURS' && oldProject.status === 'EN_ATTENTE') {
            sendProjectStartEmail({
              to: client.email,
              name: client.name || client.email,
              projectName: project.name,
              portalUrl,
            }).catch(() => {})
          } else if (update.status === 'TERMINE') {
            sendProjectCompleteEmail({
              to: client.email,
              name: client.name || client.email,
              projectName: project.name,
              portalUrl,
            }).catch(() => {})
          }

          // Create in-app notification for client
          createNotification({
            recipient: client._id as any,
            type: 'PROJECT_UPDATE',
            title: `Projet "${project.name}" — statut mis à jour`,
            message: `Le statut de votre projet est passé à ${update.status}`,
            link: `/espace-client/projects/${project._id}`,
          }).catch(() => {})
        }
      } else if (update.isArchived !== undefined && update.isArchived !== oldProject.isArchived) {
        await logActivity({ project: project._id, action: update.isArchived ? 'PROJECT_ARCHIVED' : 'PROJECT_UNARCHIVED', actor: req.user!.id, summary: update.isArchived ? 'Projet archivé' : 'Projet désarchivé' })
      } else {
        const changedFields = Object.keys(update).filter((k) => k !== 'status' && k !== 'isArchived')
        if (changedFields.length > 0) {
          await logActivity({ project: project._id, action: 'PROJECT_UPDATED', actor: req.user!.id, summary: `Projet mis à jour (${changedFields.join(', ')})` })
        }
      }
    }

    return res.json({ project })
  } catch (err) {
    return next(err)
  }
})

router.delete('/:id', requirePermission(PERMISSIONS.EDIT_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id)
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/updates', requirePermission(PERMISSIONS.EDIT_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description } = req.body || {}
    if (!title) {
      return res.status(400).json({ error: 'title is required' })
    }

    const project = await Project.findById(req.params.id)
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }

    const update = await ProjectUpdate.create({
      project: project._id,
      title,
      description: description || '',
      createdBy: req.user!.id,
    })

    await logActivity({ project: project._id, action: 'UPDATE_POSTED', actor: req.user!.id, summary: `Mise à jour : ${title}` })

    // Email client about the update
    const client = await User.findById(project.client)
    if (client?.email) {
      const clientBaseUrl = process.env.CLIENT_URL || 'http://localhost:5501/espace-client'
      sendClientProjectUpdateEmail({
        to: client.email,
        clientName: client.name || client.email,
        projectName: project.name,
        updateTitle: title,
        updateDescription: description || '',
        projectUrl: `${clientBaseUrl}/projects/${project._id}`,
      }).catch(() => {})
    }

    return res.status(201).json({ update })
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/documents', requirePermission(PERMISSIONS.EDIT_PROJECTS), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type } = req.body || {}
    if (!type || !['DEVIS', 'FACTURE', 'FICHIER_PROJET'].includes(type)) {
      return res.status(400).json({ error: 'Invalid document type' })
    }

    const project = await Project.findById(req.params.id)
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }

    const file = req.file as Express.Multer.File | undefined
    if (!file) {
      return res.status(400).json({ error: 'File is required' })
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filename = `${Date.now()}-${safeName}`
    const relativePath = path.join('uploads', 'projects', project._id.toString(), type, filename)
    const absolutePath = path.resolve(process.cwd(), relativePath)

    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, file.buffer)

    const document = await Document.create({
      project: project._id,
      type,
      originalName: file.originalname,
      storagePath: relativePath,
      mimeType: file.mimetype,
      uploadedBy: req.user!.id,
      uploadedAt: new Date(),
    })

    await logActivity({ project: project._id, action: 'DOCUMENT_UPLOADED', actor: req.user!.id, summary: `Document uploadé : ${file.originalname}`, metadata: { type, filename: file.originalname } })

    // Notify client about new deliverable/document
    const docClient = await User.findById(project.client)
    if (docClient?.email) {
      sendDeliverableNotificationEmail({
        to: docClient.email,
        name: docClient.name || docClient.email,
        projectName: project.name,
        deliverableName: file.originalname,
      }).catch(() => {})

      createNotification({
        recipient: docClient._id as any,
        type: 'DOCUMENT_ADDED',
        title: `Nouveau document sur "${project.name}"`,
        message: `Le fichier "${file.originalname}" a été ajouté à votre projet`,
        link: `/espace-client/projects/${project._id}`,
      }).catch(() => {})
    }

    return res.status(201).json({ document })
  } catch (err) {
    return next(err)
  }
})

// GET /api/admin/projects/:id/recap-pdf — Télécharger le récapitulatif PDF d'un projet
router.get('/:id/recap-pdf', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findById(req.params.id)
    if (!project) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    const [client, tasks, updates, sections] = await Promise.all([
      User.findById(project.client).select('name email').lean(),
      Task.find({ project: project._id }).populate('assignee', 'name').sort({ status: 1, order: 1 }).lean(),
      ProjectUpdate.find({ project: project._id }).sort({ createdAt: -1 }).lean(),
      ProjectSection.find({ project: project._id }).sort({ order: 1 }).lean(),
    ])

    const buffer = await generateProjectRecapPdf({ project, client, tasks: tasks as any, updates, sections })

    const safeName = project.name.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçœæ\s-]/gi, '').replace(/\s+/g, '_')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Recap_${safeName}.pdf"`)
    res.send(buffer)
  } catch (err) {
    return next(err)
  }
})

export default router
