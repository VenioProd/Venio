import express, { Request, Response, NextFunction } from 'express'
import path from 'path'
import fs from 'fs/promises'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import Project from '../../models/Project.js'
import User from '../../models/User.js'
import BillingDocument from '../../models/BillingDocument.js'
import CompanySettings from '../../models/CompanySettings.js'
import AccountingEntry from '../../models/AccountingEntry.js'
import AccountingLine from '../../models/AccountingLine.js'
import { getNextSequence } from '../../models/Sequence.js'
import { generateBillingPdf } from '../../lib/pdfBilling.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { sendInvoiceEmail } from '../../lib/email.js'
import { createNotification } from '../../lib/notifications.js'
import { notifySuperAdmins } from '../../lib/notifyHelpers.js'
import { createSaleEntryFromBilling, buildBillingIdempotencyKey } from '../../lib/accounting/billingToEntry.js'
import { runInTransaction } from '../../lib/transaction.js'
import { invoiceAmountsCents } from '../../lib/projectFinance/invoicing.js'
import { moneyError } from '../../lib/projectFinance/money.js'
import { markInvoicePaid, assertInvoiceHasNoReceipts } from '../../lib/projectFinance/payments.js'
import { createPaymentEntryFromBilling } from '../../lib/accounting/paymentToEntry.js'

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
      const docs = await BillingDocument.find({ project: project._id }).sort({ createdAt: -1 }).lean()
      return res.json({ documents: docs })
    } catch (err) {
      return next(err)
    }
  },
)

// Create quote for a project (auto number, default line from budget)
router.post(
  '/projects/:projectId/quotes',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
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
      const lines =
        req.body?.lines && Array.isArray(req.body.lines) && req.body.lines.length > 0
          ? req.body.lines.map((l: any) => ({
              description: l.description || (project as any).name || 'Prestation',
              quantity: Number(l.quantity) || 1,
              unitPrice: Number(l.unitPrice) || budgetAmount,
              taxRate: Number(l.taxRate) || 0,
              total: Number.isFinite(Number(l.total))
                ? Number(l.total)
                : (Number(l.quantity) || 1) * (Number(l.unitPrice) || budgetAmount),
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

      // Notif aux super admins
      notifySuperAdmins({
        type: 'BILLING_QUOTE_CREATED',
        title: `Nouveau devis ${formatted}`,
        message: `${(project as any).name} — ${total.toLocaleString('fr-FR')} ${currency}`,
        link: `/admin/billing/${doc._id}`,
        metadata: { documentId: String(doc._id), projectId: String(project._id) },
        excludeUserId: req.user!.id,
      }).catch(() => {})

      return res.status(201).json({ document: fullDoc })
    } catch (err) {
      return next(err)
    }
  },
)

// Create invoice for a project (auto number)
router.post(
  '/projects/:projectId/invoices',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
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
      const lines =
        req.body?.lines && Array.isArray(req.body.lines) && req.body.lines.length > 0
          ? req.body.lines.map((l: any) => ({
              description: l.description || (project as any).name || 'Prestation',
              quantity: Number(l.quantity) || 1,
              unitPrice: Number(l.unitPrice) || budgetAmount,
              taxRate: Number(l.taxRate) || 0,
              total: Number.isFinite(Number(l.total))
                ? Number(l.total)
                : (Number(l.quantity) || 1) * (Number(l.unitPrice) || budgetAmount),
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

      // Notif aux super admins
      notifySuperAdmins({
        type: 'BILLING_INVOICE_CREATED',
        title: `Nouvelle facture ${formatted}`,
        message: `${(project as any).name} — ${total.toLocaleString('fr-FR')} ${currency}`,
        link: `/admin/billing/${doc._id}`,
        metadata: { documentId: String(doc._id), projectId: String(project._id) },
        excludeUserId: req.user!.id,
      }).catch(() => {})

      return res.status(201).json({ document: fullDoc })
    } catch (err) {
      return next(err)
    }
  },
)

// Get one billing document
router.get(
  '/:id',
  requirePermission(PERMISSIONS.VIEW_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await BillingDocument.findById(req.params.id).lean()
      if (!doc) {
        return res.status(404).json({ error: 'Billing document not found' })
      }
      return res.json({ document: doc })
    } catch (err) {
      return next(err)
    }
  },
)

// Update billing document (status, dates, lines)
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body || {}
      let doc = await BillingDocument.findById(req.params.id)
      if (!doc) {
        return res.status(404).json({ error: 'Billing document not found' })
      }
      if (body.status === 'PARTIALLY_PAID') {
        return res.status(400).json({ error: 'Le statut partiellement payé est calculé depuis les encaissements' })
      }
      const markPaid = doc.type === 'INVOICE' && body.status === 'PAID'

      if (body.status !== undefined && !markPaid) {
        doc.status = body.status
      }
      if (body.paidAt !== undefined && !markPaid) {
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
          total: Number.isFinite(Number(l.total)) ? Number(l.total) : 0,
        }))
        doc.subtotal = doc.lines.reduce((s: number, l: any) => s + (l.total || 0), 0)
        doc.taxTotal = doc.lines.reduce((s: number, l: any) => s + (l.total || 0) * ((l.taxRate || 0) / 100), 0)
        doc.total = doc.subtotal + doc.taxTotal
      }
      await doc.save()

      let paymentEntry: unknown = null
      if (markPaid) {
        const result = await markInvoicePaid({
          invoice: doc,
          method: body.method,
          paidAt: body.paidAt,
          userId: req.user!.id,
        })
        if (result) paymentEntry = await AccountingEntry.findById(result.payment.entry).lean()
        doc = (await BillingDocument.findById(doc._id))!
      }

      return res.json({
        document: doc.toObject(),
        accounting: paymentEntry ? { paymentEntry } : undefined,
      })
    } catch (err) {
      return next(err)
    }
  },
)

// Mark as sent
router.post(
  '/:id/send',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await BillingDocument.findById(req.params.id)
      if (!doc) {
        return res.status(404).json({ error: 'Billing document not found' })
      }
      const payerEmail = doc.payer?.billingContact.email?.trim()
      if (doc.type === 'INVOICE' && doc.payer && doc.payer.kind !== 'CLIENT' && !payerEmail) {
        return res.status(400).json({ error: 'Renseignez l’e-mail de facturation du payeur avant l’envoi' })
      }
      const client = doc.type === 'INVOICE' ? await User.findById(doc.client) : null
      const recipientEmail = payerEmail || client?.email
      doc.status = 'SENT'
      doc.sentAt = new Date()
      await doc.save()

      // Auto-email client when invoice is sent
      if (doc.type === 'INVOICE') {
        if (recipientEmail) {
          const baseUrl = process.env.ADMIN_LOGIN_URL
            ? process.env.ADMIN_LOGIN_URL.replace('/login', '')
            : 'http://localhost:5501/admin'
          const downloadUrl = `${baseUrl}/billing/${doc._id}/pdf`
          const amountStr = `${doc.total.toLocaleString('fr-FR')} ${doc.currency}`
          const dueDateStr = doc.dueAt ? doc.dueAt.toLocaleDateString('fr-FR') : 'Non définie'
          sendInvoiceEmail({
            to: recipientEmail,
            name: doc.payer?.billingContact.name || client?.name || recipientEmail,
            invoiceNumber: doc.number,
            amount: amountStr,
            dueDate: dueDateStr,
            downloadUrl,
          }).catch(() => {})
        }
      }

      // Notif client (in-app — l'email peut être désactivé)
      if (doc.client && (!doc.payer || doc.payer.kind === 'CLIENT')) {
        createNotification({
          recipient: doc.client,
          type: 'BILLING_DOCUMENT_SENT',
          title: doc.type === 'INVOICE' ? `Nouvelle facture` : `Nouveau devis`,
          message: `${doc.number} — ${doc.total.toLocaleString('fr-FR')} ${doc.currency}`,
          link: `/client/billing/${doc._id}`,
          metadata: { documentId: String(doc._id) },
        }).catch(() => {})
      }
      // Notif super admins (traçabilité)
      notifySuperAdmins({
        type: 'BILLING_DOCUMENT_SENT',
        title: `${doc.type === 'INVOICE' ? 'Facture' : 'Devis'} ${doc.number} envoyé(e)`,
        message: `Envoyé(e) au client`,
        link: `/admin/billing/${doc._id}`,
        metadata: { documentId: String(doc._id) },
        excludeUserId: req.user!.id,
      }).catch(() => {})

      return res.json({ document: doc.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

// Generate PDF and store path
router.post(
  '/:id/generate-pdf',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await BillingDocument.findById(req.params.id)
      if (!doc) {
        return res.status(404).json({ error: 'Billing document not found' })
      }
      if ((doc.financeLink || doc.creditedInvoice) && doc.status === 'CANCELLED') {
        return res.status(409).json({ error: 'Une facture d’échéance annulée ne peut pas être émise' })
      }
      const project = await Project.findById(doc.project).lean()
      const client = await User.findById(doc.client).lean()
      if (!project || !client) {
        return res.status(400).json({ error: 'Project or client not found' })
      }

      const wasDraft = doc.status === 'DRAFT'
      doc.issuedAt ||= new Date()
      if (doc.type === 'INVOICE' && doc.financeLink && !doc.dueAt) {
        const settings = await CompanySettings.findOne({ singletonKey: 'MAIN' }).lean()
        doc.dueAt = new Date(doc.issuedAt)
        doc.dueAt.setUTCDate(doc.dueAt.getUTCDate() + (settings?.paymentTermsDays ?? 30))
      }

      const filename = `${doc.type}-${doc.number.replace(/\//g, '-')}.pdf`
      const storagePath = path.join('uploads', 'billing', doc.project.toString(), filename)
      await generateBillingPdf(doc, client, project, storagePath)

      let saleEntry: unknown = null
      let accountingWarning: string | null = null
      if (doc.creditedInvoice) {
        const emitted = await runInTransaction(async (session) => {
          await BillingDocument.updateOne(
            { _id: doc.creditedInvoice },
            { $currentDate: { updatedAt: true } },
            { session },
          )
          const original = await BillingDocument.findById(doc.creditedInvoice).session(session)
          if (!original) throw moneyError('Facture d’origine introuvable')
          await assertInvoiceHasNoReceipts(original, session)
          const current = await BillingDocument.findById(doc._id).session(session)
          if (!current || current.status !== doc.$locals.loadedStatus) {
            const err = moneyError('Le statut de l’avoir a changé ; rechargez-le')
            err.status = 409
            throw err
          }
          current.pdfStoragePath = storagePath
          current.issuedAt = doc.issuedAt
          if (wasDraft) current.status = 'ISSUED'
          await current.save({ session })
          const sale = await createSaleEntryFromBilling(current, { userId: req.user!.id, session })
          if (original.financeLink?.kind === 'INSTALLMENT') {
            const credits = await BillingDocument.find({
              creditedInvoice: original._id,
              status: { $in: ['ISSUED', 'SENT', 'PAID'] },
            }).session(session)
            const creditedHt = credits.reduce((sum, credit) => sum - invoiceAmountsCents(credit).htCents, 0)
            if (creditedHt === invoiceAmountsCents(original).htCents) {
              await BillingDocument.updateOne({ _id: original._id }, { $set: { financeKey: null } }, { session })
            }
          }
          return sale.entry
        })
        saleEntry = emitted
      } else {
        doc.pdfStoragePath = storagePath
        if (wasDraft) doc.status = 'ISSUED'
        await doc.save()
      }
      const updated = await BillingDocument.findById(doc._id).lean()

      // Hook comptable : générer l'écriture de vente si c'est une facture émise
      if (!doc.creditedInvoice && updated && updated.type === 'INVOICE' && (wasDraft || updated.status !== 'DRAFT')) {
        try {
          const r = await createSaleEntryFromBilling(updated as any, { userId: req.user!.id })
          saleEntry = r.entry
        } catch (err) {
          accountingWarning = `Écriture de vente non générée : ${(err as Error).message}`
        }
      }

      return res.json({
        document: updated,
        accounting: saleEntry ? { saleEntry } : accountingWarning ? { warning: accountingWarning } : undefined,
      })
    } catch (err) {
      return next(err)
    }
  },
)

// GET /:id/accounting-entries : liste les écritures comptables liées à une facture
router.get(
  '/:id/accounting-entries',
  requirePermission(PERMISSIONS.VIEW_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
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
      // Joindre les lignes pour chaque écriture
      const result: Array<Record<string, unknown>> = []
      for (const e of entries) {
        const lines = await AccountingLine.find({ entry: e._id }).sort({ sortIndex: 1 }).lean()
        result.push({ ...e, lines })
      }
      return res.json({ entries: result })
    } catch (err) {
      return next(err)
    }
  },
)

// POST /:id/generate-accounting : déclenche manuellement la génération
// d'écritures (sale + optionnellement payment si la facture est PAID).
// Idempotent grâce à billing:sale:<id> / billing:payment:<id>.
router.post(
  '/:id/generate-accounting',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await BillingDocument.findById(req.params.id).lean()
      if (!doc) {
        return res.status(404).json({ error: 'Billing document not found' })
      }
      if (doc.type !== 'INVOICE') {
        return res.status(400).json({ error: 'Only invoices can generate accounting entries' })
      }
      const result: {
        sale: { entry: unknown; alreadyExisted: boolean } | null
        payment: { entry: unknown; alreadyExisted: boolean } | null
        paymentError?: string
      } = { sale: null, payment: null }
      try {
        const r = await createSaleEntryFromBilling(doc as any, { userId: req.user!.id })
        result.sale = { entry: r.entry, alreadyExisted: r.alreadyExisted || false }
      } catch (err) {
        const status = (err as { status?: number }).status
        return res.status(status || 500).json({ error: (err as Error).message })
      }
      if (doc.status === 'PAID') {
        try {
          const r = await createPaymentEntryFromBilling(doc as any, { userId: req.user!.id })
          result.payment = { entry: r.entry, alreadyExisted: r.alreadyExisted || false }
        } catch (err) {
          result.paymentError = (err as Error).message
        }
      }
      return res.json(result)
    } catch (err) {
      return next(err)
    }
  },
)

// Serve PDF
router.get(
  '/:id/pdf',
  requirePermission(PERMISSIONS.VIEW_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
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
  },
)

export default router
