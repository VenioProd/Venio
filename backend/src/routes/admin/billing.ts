import express, { Request, Response, NextFunction } from 'express'
import path from 'path'
import fs from 'fs/promises'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import Project from '../../models/Project.js'
import User from '../../models/User.js'
import BillingDocument from '../../models/BillingDocument.js'
import { getNextSequence } from '../../models/Sequence.js'
import { generateBillingPdf } from '../../lib/pdfBilling.js'
import { PERMISSIONS } from '../../lib/permissions.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// List billing documents for a project
router.get(
  '/projects/:projectId/billing-documents',
  requirePermission(PERMISSIONS.VIEW_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findById(req.params.projectId)
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }
    const docs = await BillingDocument.find({ project: project._id })
      .sort({ createdAt: -1 })
      .lean()
    return res.json({ documents: docs })
  } catch (err) {
    return next(err)
  }
})

// Create quote for a project (auto number, default line from budget)
router.post('/projects/:projectId/quotes', requirePermission(PERMISSIONS.MANAGE_BILLING), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findById(req.params.projectId).lean()
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }
    const client = await User.findById(project.client).lean()
    if (!client) {
      return res.status(400).json({ error: 'Client not found' })
    }

    const { value, formatted } = await getNextSequence('quoteNumber', {
      prefix: 'DEV-',
      padding: 4,
    })
    const budgetAmount = (project as any).budget?.amount ?? 0
    const currency = (project as any).budget?.currency || 'EUR'
    const lines = (req.body?.lines && Array.isArray(req.body.lines) && req.body.lines.length > 0)
      ? req.body.lines.map((l: any) => ({
          description: l.description || (project as any).name || 'Prestation',
          quantity: Number(l.quantity) || 1,
          unitPrice: Number(l.unitPrice) || budgetAmount,
          taxRate: Number(l.taxRate) || 0,
          total: Number(l.total) ?? (Number(l.quantity) || 1) * (Number(l.unitPrice) || budgetAmount),
        }))
      : [
          {
            description: (project as any).summary || (project as any).name || 'Prestation',
            quantity: 1,
            unitPrice: budgetAmount,
            taxRate: 0,
            total: budgetAmount,
          },
        ]

    const subtotal = lines.reduce((s: number, l: any) => s + (l.total || 0), 0)
    const taxTotal = lines.reduce((s: number, l: any) => s + (l.total || 0) * ((l.taxRate || 0) / 100), 0)
    const total = subtotal + taxTotal

    const doc = await BillingDocument.create({
      type: 'QUOTE',
      number: formatted,
      project: project._id,
      client: project.client,
      status: 'DRAFT',
      lines,
      subtotal,
      taxTotal,
      total,
      currency,
      note: req.body?.note || '',
      createdBy: req.user!.id,
    })

    const fullDoc = await BillingDocument.findById(doc._id).lean()
    return res.status(201).json({ document: fullDoc })
  } catch (err) {
    return next(err)
  }
})

// Create invoice for a project (auto number)
router.post('/projects/:projectId/invoices', requirePermission(PERMISSIONS.MANAGE_BILLING), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findById(req.params.projectId).lean()
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }

    const { formatted } = await getNextSequence('invoiceNumber', {
      prefix: 'FAC-',
      padding: 4,
    })

    const budgetAmount = (project as any).budget?.amount ?? (project as any).billing?.amountInvoiced ?? 0
    const currency = (project as any).budget?.currency || 'EUR'
    const lines = (req.body?.lines && Array.isArray(req.body.lines) && req.body.lines.length > 0)
      ? req.body.lines.map((l: any) => ({
          description: l.description || (project as any).name || 'Prestation',
          quantity: Number(l.quantity) || 1,
          unitPrice: Number(l.unitPrice) || budgetAmount,
          taxRate: Number(l.taxRate) || 0,
          total: Number(l.total) ?? (Number(l.quantity) || 1) * (Number(l.unitPrice) || budgetAmount),
        }))
      : [
          {
            description: (project as any).summary || (project as any).name || 'Prestation',
            quantity: 1,
            unitPrice: budgetAmount,
            taxRate: 0,
            total: budgetAmount,
          },
        ]

    const subtotal = lines.reduce((s: number, l: any) => s + (l.total || 0), 0)
    const taxTotal = lines.reduce((s: number, l: any) => s + (l.total || 0) * ((l.taxRate || 0) / 100), 0)
    const total = subtotal + taxTotal

    const doc = await BillingDocument.create({
      type: 'INVOICE',
      number: formatted,
      project: project._id,
      client: project.client,
      status: 'DRAFT',
      lines,
      subtotal,
      taxTotal,
      total,
      currency,
      dueAt: req.body?.dueAt ? new Date(req.body.dueAt) : null,
      note: req.body?.note || '',
      createdBy: req.user!.id,
    })

    const fullDoc = await BillingDocument.findById(doc._id).lean()
    return res.status(201).json({ document: fullDoc })
  } catch (err) {
    return next(err)
  }
})

// Get one billing document
router.get('/:id', requirePermission(PERMISSIONS.VIEW_BILLING), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await BillingDocument.findById(req.params.id).lean()
    if (!doc) {
      return res.status(404).json({ error: 'Billing document not found' })
    }
    return res.json({ document: doc })
  } catch (err) {
    return next(err)
  }
})

// Update billing document (status, dates, lines)
router.patch('/:id', requirePermission(PERMISSIONS.MANAGE_BILLING), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {}
    const doc = await BillingDocument.findById(req.params.id)
    if (!doc) {
      return res.status(404).json({ error: 'Billing document not found' })
    }

    if (body.status !== undefined) {
      doc.status = body.status
    }
    if (body.paidAt !== undefined) {
      doc.paidAt = body.paidAt ? new Date(body.paidAt) : null
    }
    if (body.dueAt !== undefined) {
      doc.dueAt = body.dueAt ? new Date(body.dueAt) : null
    }
    if (body.note !== undefined) {
      doc.note = body.note
    }
    if (body.lines && Array.isArray(body.lines)) {
      doc.lines = body.lines.map((l: any) => ({
        description: l.description || '',
        quantity: Number(l.quantity) || 1,
        unitPrice: Number(l.unitPrice) || 0,
        taxRate: Number(l.taxRate) || 0,
        total: Number(l.total) ?? 0,
      }))
      doc.subtotal = doc.lines.reduce((s: number, l: any) => s + (l.total || 0), 0)
      doc.taxTotal = doc.lines.reduce((s: number, l: any) => s + (l.total || 0) * ((l.taxRate || 0) / 100), 0)
      doc.total = doc.subtotal + doc.taxTotal
    }
    await doc.save()
    return res.json({ document: doc.toObject() })
  } catch (err) {
    return next(err)
  }
})

// Mark as sent
router.post('/:id/send', requirePermission(PERMISSIONS.MANAGE_BILLING), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await BillingDocument.findById(req.params.id)
    if (!doc) {
      return res.status(404).json({ error: 'Billing document not found' })
    }
    doc.status = doc.type === 'QUOTE' ? 'SENT' : 'SENT'
    doc.sentAt = new Date()
    await doc.save()
    return res.json({ document: doc.toObject() })
  } catch (err) {
    return next(err)
  }
})

// Generate PDF and store path
router.post('/:id/generate-pdf', requirePermission(PERMISSIONS.MANAGE_BILLING), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await BillingDocument.findById(req.params.id).lean()
    if (!doc) {
      return res.status(404).json({ error: 'Billing document not found' })
    }
    const project = await Project.findById(doc.project).lean()
    const client = await User.findById(doc.client).lean()
    if (!project || !client) {
      return res.status(400).json({ error: 'Project or client not found' })
    }

    const filename = `${doc.type}-${doc.number.replace(/\//g, '-')}.pdf`
    const storagePath = path.join('uploads', 'billing', doc.project.toString(), filename)
    await generateBillingPdf(doc, client, project, storagePath)

    await BillingDocument.findByIdAndUpdate(doc._id, {
      pdfStoragePath: storagePath,
      status: doc.status === 'DRAFT' ? 'ISSUED' : doc.status,
      issuedAt: doc.issuedAt || new Date(),
    })

    const updated = await BillingDocument.findById(doc._id).lean()
    return res.json({ document: updated })
  } catch (err) {
    return next(err)
  }
})

// Serve PDF
router.get('/:id/pdf', requirePermission(PERMISSIONS.VIEW_BILLING), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await BillingDocument.findById(req.params.id).lean()
    if (!doc) {
      return res.status(404).json({ error: 'Billing document not found' })
    }
    if (!doc.pdfStoragePath) {
      return res.status(404).json({ error: 'PDF not generated yet' })
    }
    const absolutePath = path.resolve(process.cwd(), doc.pdfStoragePath)
    try {
      await fs.access(absolutePath)
    } catch {
      return res.status(404).json({ error: 'PDF file not found' })
    }
    res.setHeader('Content-Type', 'application/pdf')
    res.sendFile(absolutePath)
  } catch (err) {
    return next(err)
  }
})

export default router
