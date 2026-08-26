import express, { type NextFunction, type Request, type Response } from 'express'
import auth from '../../middleware/auth.js'
import Project from '../../models/Project.js'
import ProjectMember from '../../models/ProjectMember.js'
import BillingDocument from '../../models/BillingDocument.js'
import ProjectItem from '../../models/ProjectItem.js'
import Document from '../../models/Document.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import { computeQuoteTotals } from '../../lib/quoteTotals.js'
import type { IQuoteLine } from '../../types/models/index.js'
import type { ClientActionItemType, ClientVaultDocumentType, ClientVaultSource } from '../../types/enums.js'

interface ClientVaultDocument {
  id: string
  source: ClientVaultSource
  type: ClientVaultDocumentType
  title: string
  project: { id: string; name: string }
  date: string
  size: number | null
  mimeType: string | null
  downloadUrl: string
}

interface ClientActionItem {
  type: ClientActionItemType
  title: string
  detail: string
  project: { id: string; name: string }
  link: string
  dueAt: string | null
  amount: number
  createdAt: string
}

const router = express.Router()
router.use(auth)

async function accessibleProjectIds(userId: string): Promise<string[]> {
  const [owned, memberOf] = await Promise.all([
    Project.find({ client: userId }).select('_id').lean(),
    ProjectMember.find({ user: userId }).select('project').lean(),
  ])
  const ids = new Set<string>()
  owned.forEach((project) => ids.add(String(project._id)))
  memberOf.forEach((member) => ids.add(String(member.project)))
  return Array.from(ids)
}

const CLIENT_VISIBLE_BILLING_STATUSES = ['ISSUED', 'SENT', 'ACCEPTED', 'PAID']

router.get('/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
    const userId = req.user!.id
    const { type, projectId, q } = req.query as Record<string, string | undefined>

    let projectIds = await accessibleProjectIds(userId)
    if (projectId) {
      projectIds = projectIds.includes(projectId) ? [projectId] : []
    }
    if (projectIds.length === 0) return res.json({ documents: [] })

    const projects = await Project.find({ _id: { $in: projectIds } })
      .select('name')
      .lean()
    const projectNameById = new Map(projects.map((project) => [String(project._id), project.name]))

    const [billingDocs, items, legacyDocs] = await Promise.all([
      BillingDocument.find({
        project: { $in: projectIds },
        status: { $in: CLIENT_VISIBLE_BILLING_STATUSES },
        pdfStoragePath: { $ne: null },
      }).lean(),
      ProjectItem.find({
        project: { $in: projectIds },
        isVisible: true,
        isDownloadable: true,
        'file.storagePath': { $exists: true, $ne: null },
      }).lean(),
      Document.find({ project: { $in: projectIds } }).lean(),
    ])

    const documents: ClientVaultDocument[] = []

    for (const doc of billingDocs) {
      const pid = String(doc.project)
      documents.push({
        id: String(doc._id),
        source: 'BILLING',
        type: doc.type === 'QUOTE' ? 'DEVIS' : 'FACTURE',
        title: doc.number,
        project: { id: pid, name: projectNameById.get(pid) || '' },
        date: (doc.issuedAt ?? doc.createdAt).toISOString(),
        size: null,
        mimeType: null,
        downloadUrl: `/api/projects/${pid}/billing/${doc._id}/pdf`,
      })
    }

    for (const item of items) {
      const pid = String(item.project)
      documents.push({
        id: String(item._id),
        source: 'PROJECT_ITEM',
        type: item.type === 'CONTRAT' ? 'CONTRAT' : 'LIVRABLE',
        title: item.title,
        project: { id: pid, name: projectNameById.get(pid) || '' },
        date: item.updatedAt.toISOString(),
        size: item.file?.size ?? null,
        mimeType: item.file?.mimeType ?? null,
        downloadUrl: `/api/projects/${pid}/items/${item._id}/download`,
      })
    }

    for (const doc of legacyDocs) {
      const pid = String(doc.project)
      documents.push({
        id: String(doc._id),
        source: 'DOCUMENT',
        type: doc.type,
        title: doc.originalName,
        project: { id: pid, name: projectNameById.get(pid) || '' },
        date: doc.uploadedAt.toISOString(),
        size: null,
        mimeType: doc.mimeType,
        downloadUrl: `/api/documents/${doc._id}/download`,
      })
    }

    let result = documents
    if (type) result = result.filter((d) => d.type === type)
    if (q) {
      const needle = q.toLowerCase()
      result = result.filter((d) => d.title.toLowerCase().includes(needle))
    }
    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return res.json({ documents: result })
  } catch (err) {
    return next(err)
  }
})

router.get('/action-items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
    const userId = req.user!.id

    const ownedProjects = await Project.find({ client: userId }).select('name').lean()
    const ownedProjectIds = ownedProjects.map((project) => String(project._id))
    const projectNameById = new Map(ownedProjects.map((project) => [String(project._id), project.name]))

    if (ownedProjectIds.length === 0) return res.json({ items: [] })

    const now = new Date()
    const [proposals, invoices] = await Promise.all([
      QuoteProposal.find({
        project: { $in: ownedProjectIds },
        status: 'SENT',
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      }).lean(),
      BillingDocument.find({
        project: { $in: ownedProjectIds },
        type: 'INVOICE',
        status: { $in: ['ISSUED', 'SENT'] },
      }).lean(),
    ])

    const items: ClientActionItem[] = []

    for (const proposal of proposals) {
      const pid = String(proposal.project)
      const totals = computeQuoteTotals(proposal.lines as unknown as IQuoteLine[], proposal.selectedOptionalLineIds)
      items.push({
        type: 'DEVIS_A_SIGNER',
        title: `Proposition « ${proposal.title} » à signer`,
        detail: '',
        project: { id: pid, name: projectNameById.get(pid) || '' },
        link: `/espace-client/projets/${pid}/propositions/${proposal._id}`,
        dueAt: proposal.expiresAt ? proposal.expiresAt.toISOString() : null,
        amount: totals.total,
        createdAt: proposal.createdAt.toISOString(),
      })
    }

    for (const invoice of invoices) {
      const pid = String(invoice.project)
      items.push({
        type: 'FACTURE_A_PAYER',
        title: `Facture ${invoice.number} à régler`,
        detail: '',
        project: { id: pid, name: projectNameById.get(pid) || '' },
        link: `/espace-client/projets/${pid}/facturation`,
        dueAt: invoice.dueAt ? invoice.dueAt.toISOString() : null,
        amount: invoice.total,
        createdAt: invoice.createdAt.toISOString(),
      })
    }

    items.sort((a, b) => {
      if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
      if (a.dueAt) return -1
      if (b.dueAt) return 1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return res.json({ items })
  } catch (err) {
    return next(err)
  }
})

export default router
