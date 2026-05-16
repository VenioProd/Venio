import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import Project from '../../models/Project.js'
import User from '../../models/User.js'
import BillingDocument from '../../models/BillingDocument.js'
import AccountingEntry from '../../models/AccountingEntry.js'
import AccountingLine from '../../models/AccountingLine.js'
import AuditLog from '../../models/AuditLog.js'
import { getNextSequence } from '../../models/Sequence.js'
import { generateBillingPdf } from '../../lib/pdfBilling.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import {
  createSaleEntryFromBilling,
  buildBillingIdempotencyKey,
} from '../../lib/accounting/billingToEntry.js'
import { createPaymentEntryFromBilling } from '../../lib/accounting/paymentToEntry.js'
import { buildActorFromReq } from '../../lib/audit/auditMiddleware.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// List billing documents for a project
router.get(
  '/projects/:projectId/billing-documents',
  requirePermission(PERMISSIONS.VIEW_BILLING),
  async (req, res, next) => {
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
router.post('/projects/:projectId/quotes', requirePermission(PERMISSIONS.MANAGE_BILLING), async (req, res, next) => {
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
    const budgetAmount = project.budget?.amount ?? 0
    const currency = project.budget?.currency || 'EUR'
    const lines = (req.body?.lines && Array.isArray(req.body.lines) && req.body.lines.length > 0)
      ? req.body.lines.map((l) => ({
          description: l.description || project.name || 'Prestation',
          quantity: Number(l.quantity) || 1,
          unitPrice: Number(l.unitPrice) || budgetAmount,
          taxRate: Number(l.taxRate) || 0,
          total: Number(l.total) ?? (Number(l.quantity) || 1) * (Number(l.unitPrice) || budgetAmount),
        }))
      : [
          {
            description: project.summary || project.name || 'Prestation',
            quantity: 1,
            unitPrice: budgetAmount,
            taxRate: 0,
            total: budgetAmount,
          },
        ]

    const subtotal = lines.reduce((s, l) => s + (l.total || 0), 0)
    const taxTotal = lines.reduce((s, l) => s + (l.total || 0) * ((l.taxRate || 0) / 100), 0)
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
      createdBy: req.user.id,
    })

    const fullDoc = await BillingDocument.findById(doc._id).lean()
    return res.status(201).json({ document: fullDoc })
  } catch (err) {
    return next(err)
  }
})

// Create invoice for a project (auto number)
router.post('/projects/:projectId/invoices', requirePermission(PERMISSIONS.MANAGE_BILLING), async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.projectId).lean()
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }

    const { formatted } = await getNextSequence('invoiceNumber', {
      prefix: 'FAC-',
      padding: 4,
    })

    const budgetAmount = project.budget?.amount ?? project.billing?.amountInvoiced ?? 0
    const currency = project.budget?.currency || 'EUR'
    const lines = (req.body?.lines && Array.isArray(req.body.lines) && req.body.lines.length > 0)
      ? req.body.lines.map((l) => ({
          description: l.description || project.name || 'Prestation',
          quantity: Number(l.quantity) || 1,
          unitPrice: Number(l.unitPrice) || budgetAmount,
          taxRate: Number(l.taxRate) || 0,
          total: Number(l.total) ?? (Number(l.quantity) || 1) * (Number(l.unitPrice) || budgetAmount),
        }))
      : [
          {
            description: project.summary || project.name || 'Prestation',
            quantity: 1,
            unitPrice: budgetAmount,
            taxRate: 0,
            total: budgetAmount,
          },
        ]

    const subtotal = lines.reduce((s, l) => s + (l.total || 0), 0)
    const taxTotal = lines.reduce((s, l) => s + (l.total || 0) * ((l.taxRate || 0) / 100), 0)
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
      createdBy: req.user.id,
    })

    const fullDoc = await BillingDocument.findById(doc._id).lean()
    return res.status(201).json({ document: fullDoc })
  } catch (err) {
    return next(err)
  }
})

// Get one billing document
router.get('/:id', requirePermission(PERMISSIONS.VIEW_BILLING), async (req, res, next) => {
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
router.patch('/:id', requirePermission(PERMISSIONS.MANAGE_BILLING), async (req, res, next) => {
  try {
    const body = req.body || {}
    const doc = await BillingDocument.findById(req.params.id)
    if (!doc) {
      return res.status(404).json({ error: 'Billing document not found' })
    }

    const previousStatus = doc.status

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
      doc.lines = body.lines.map((l) => ({
        description: l.description || '',
        quantity: Number(l.quantity) || 1,
        unitPrice: Number(l.unitPrice) || 0,
        taxRate: Number(l.taxRate) || 0,
        total: Number(l.total) ?? 0,
      }))
      doc.subtotal = doc.lines.reduce((s, l) => s + (l.total || 0), 0)
      doc.taxTotal = doc.lines.reduce((s, l) => s + (l.total || 0) * ((l.taxRate || 0) / 100), 0)
      doc.total = doc.subtotal + doc.taxTotal
    }
    await doc.save()

    // Hook comptable : si la facture passe à PAID, créer l'écriture de banque
    let paymentEntry = null
    if (
      doc.type === 'INVOICE' &&
      previousStatus !== 'PAID' &&
      doc.status === 'PAID'
    ) {
      // S'assurer que paidAt est défini
      if (!doc.paidAt) {
        doc.paidAt = new Date()
        await doc.save()
      }
      try {
        const r = await createPaymentEntryFromBilling(doc.toObject(), { userId: req.user.id })
        paymentEntry = r.entry
        if (!r.alreadyExisted) {
          AuditLog.record({
            action: 'PAYMENT_TO_ENTRY',
            entityType: 'AccountingEntry',
            entityId: r.entry._id,
            entityRef: r.entry.entryNumber,
            actor: buildActorFromReq(req),
            summary: `Encaissement facture ${doc.number} → ${r.entry.entryNumber}`,
            after: {
              entryNumber: r.entry.entryNumber,
              date: r.entry.date,
              status: r.entry.status,
              totalDebit: r.entry.totalDebit,
              totalCredit: r.entry.totalCredit,
            },
            metadata: {
              billingDocumentId: doc._id,
              billingNumber: doc.number,
              paidAt: doc.paidAt,
            },
          })
        }
      } catch (err) {
        // On ne bloque pas la mise à jour si la compta n'est pas configurée ;
        // on retourne juste un avertissement.
        return res.json({
          document: doc.toObject(),
          accounting: { warning: `Écriture de paiement non générée : ${err.message}` },
        })
      }
    }

    return res.json({
      document: doc.toObject(),
      accounting: paymentEntry ? { paymentEntry } : undefined,
    })
  } catch (err) {
    return next(err)
  }
})

// Mark as sent
router.post('/:id/send', requirePermission(PERMISSIONS.MANAGE_BILLING), async (req, res, next) => {
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
router.post('/:id/generate-pdf', requirePermission(PERMISSIONS.MANAGE_BILLING), async (req, res, next) => {
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

    const wasDraft = doc.status === 'DRAFT'
    await BillingDocument.findByIdAndUpdate(doc._id, {
      pdfStoragePath: storagePath,
      status: wasDraft ? 'ISSUED' : doc.status,
      issuedAt: doc.issuedAt || new Date(),
    })

    const updated = await BillingDocument.findById(doc._id).lean()

    // Hook comptable : générer l'écriture de vente si c'est une facture émise
    let saleEntry = null
    let accountingWarning = null
    if (updated.type === 'INVOICE' && (wasDraft || updated.status !== 'DRAFT')) {
      try {
        const r = await createSaleEntryFromBilling(updated, { userId: req.user.id })
        saleEntry = r.entry
        if (!r.alreadyExisted) {
          AuditLog.record({
            action: 'BILLING_TO_ENTRY',
            entityType: 'AccountingEntry',
            entityId: r.entry._id,
            entityRef: r.entry.entryNumber,
            actor: buildActorFromReq(req),
            summary: `Facture ${updated.number} → écriture de vente ${r.entry.entryNumber}`,
            after: {
              entryNumber: r.entry.entryNumber,
              date: r.entry.date,
              status: r.entry.status,
              totalDebit: r.entry.totalDebit,
              totalCredit: r.entry.totalCredit,
            },
            metadata: {
              billingDocumentId: updated._id,
              billingNumber: updated.number,
              issuedAt: updated.issuedAt,
            },
          })
        }
      } catch (err) {
        accountingWarning = `Écriture de vente non générée : ${err.message}`
      }
    }

    return res.json({
      document: updated,
      accounting: saleEntry
        ? { saleEntry }
        : accountingWarning
          ? { warning: accountingWarning }
          : undefined,
    })
  } catch (err) {
    return next(err)
  }
})

// List accounting entries linked to a billing document
router.get('/:id/accounting-entries', requirePermission(PERMISSIONS.VIEW_BILLING), async (req, res, next) => {
  try {
    const doc = await BillingDocument.findById(req.params.id).lean()
    if (!doc) {
      return res.status(404).json({ error: 'Billing document not found' })
    }
    const saleKey = buildBillingIdempotencyKey(doc._id, 'sale')
    const paymentKey = buildBillingIdempotencyKey(doc._id, 'payment')
    const entries = await AccountingEntry.find({
      idempotencyKey: { $in: [saleKey, paymentKey] },
    })
      .sort({ date: 1 })
      .lean()
    // Joindre les lignes
    const result = []
    for (const e of entries) {
      const lines = await AccountingLine.find({ entry: e._id }).sort({ sortIndex: 1 }).lean()
      result.push({ ...e, lines })
    }
    return res.json({ entries: result })
  } catch (err) {
    return next(err)
  }
})

// Manually trigger accounting generation for a billing document (sale + optionally payment)
router.post(
  '/:id/generate-accounting',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  async (req, res, next) => {
    try {
      const doc = await BillingDocument.findById(req.params.id).lean()
      if (!doc) {
        return res.status(404).json({ error: 'Billing document not found' })
      }
      if (doc.type !== 'INVOICE') {
        return res.status(400).json({ error: 'Only invoices can generate accounting entries' })
      }
      const result = { sale: null, payment: null }
      const actor = buildActorFromReq(req)
      try {
        const r = await createSaleEntryFromBilling(doc, { userId: req.user.id })
        result.sale = { entry: r.entry, alreadyExisted: r.alreadyExisted || false }
        if (!r.alreadyExisted) {
          AuditLog.record({
            action: 'BILLING_TO_ENTRY',
            entityType: 'AccountingEntry',
            entityId: r.entry._id,
            entityRef: r.entry.entryNumber,
            actor,
            summary: `Génération manuelle écriture de vente pour ${doc.number}`,
            after: {
              entryNumber: r.entry.entryNumber,
              date: r.entry.date,
              status: r.entry.status,
              totalDebit: r.entry.totalDebit,
              totalCredit: r.entry.totalCredit,
            },
            metadata: { billingDocumentId: doc._id, billingNumber: doc.number, manual: true },
          })
        }
      } catch (err) {
        return res.status(err.status || 500).json({ error: err.message })
      }
      if (doc.status === 'PAID') {
        try {
          const r = await createPaymentEntryFromBilling(doc, { userId: req.user.id })
          result.payment = { entry: r.entry, alreadyExisted: r.alreadyExisted || false }
          if (!r.alreadyExisted) {
            AuditLog.record({
              action: 'PAYMENT_TO_ENTRY',
              entityType: 'AccountingEntry',
              entityId: r.entry._id,
              entityRef: r.entry.entryNumber,
              actor,
              summary: `Génération manuelle écriture de paiement pour ${doc.number}`,
              after: {
                entryNumber: r.entry.entryNumber,
                date: r.entry.date,
                status: r.entry.status,
                totalDebit: r.entry.totalDebit,
                totalCredit: r.entry.totalCredit,
              },
              metadata: { billingDocumentId: doc._id, billingNumber: doc.number, manual: true },
            })
          }
        } catch (err) {
          result.paymentError = err.message
        }
      }
      return res.json(result)
    } catch (err) {
      return next(err)
    }
  }
)

// Serve PDF
router.get('/:id/pdf', requirePermission(PERMISSIONS.VIEW_BILLING), async (req, res, next) => {
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
