import crypto from 'crypto'
import fsp from 'fs/promises'
import path from 'path'
import QuoteProposal from '../models/QuoteProposal.js'
import BillingDocument from '../models/BillingDocument.js'
import ProjectItem from '../models/ProjectItem.js'
import Project from '../models/Project.js'
import User from '../models/User.js'
import { getNextSequence } from '../models/Sequence.js'
import { generateBillingPdf } from './pdfBilling.js'
import { computeQuoteTotals } from './quoteTotals.js'
import type { IQuoteProposal } from '../types/models/index.js'

export interface SignatureInput {
  signerUserId: string
  signerName: string
  signerEmail: string
  ip: string
  userAgent: string
  consentText: string
}

/**
 * Verrou par prédicat d'état : deux signatures concurrentes deviennent
 * mutuellement exclusives, y compris entre processus. Même mécanique que
 * l'acceptation d'invitation projet.
 */
export async function lockProposalForSignature(
  proposalId: string,
  input: SignatureInput,
): Promise<IQuoteProposal | null> {
  return QuoteProposal.findOneAndUpdate(
    { _id: proposalId, status: 'SENT' },
    {
      $set: {
        status: 'SIGNED',
        'signature.signedAt': new Date(),
        'signature.signerUserId': input.signerUserId,
        'signature.signerName': input.signerName,
        'signature.signerEmail': input.signerEmail,
        'signature.ip': input.ip,
        'signature.userAgent': input.userAgent,
        'signature.consentText': input.consentText,
        'signature.proofVersion': 1,
      },
    },
    { new: true },
  )
}

/**
 * Idempotent : rejouable si la génération a échoué après la pose du verrou.
 * Ne consomme un numéro de séquence que lorsqu'aucun document n'existe encore.
 */
export async function buildBillingDocumentForProposal(proposal: IQuoteProposal) {
  if (proposal.billingDocument) {
    const existing = await BillingDocument.findById(proposal.billingDocument)
    if (existing) return existing
  }

  const totals = computeQuoteTotals(proposal.lines.toObject(), proposal.selectedOptionalLineIds)
  const { formatted } = await getNextSequence('quoteNumber', { prefix: 'DEV-', padding: 3 })

  const document = await BillingDocument.create({
    type: 'QUOTE',
    number: formatted,
    project: proposal.project,
    client: proposal.client,
    status: 'ACCEPTED',
    issuedAt: new Date(),
    lines: totals.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      total: Math.round(line.quantity * line.unitPrice * 100) / 100,
    })),
    subtotal: totals.subtotal,
    taxTotal: totals.taxTotal,
    total: totals.total,
    note: proposal.intro,
    createdBy: proposal.createdBy,
  })

  const [project, client] = await Promise.all([
    Project.findById(proposal.project).lean(),
    User.findById(proposal.client).lean(),
  ])
  const filename = `QUOTE-${formatted.replace(/\//g, '-')}.pdf`
  const storagePath = path.join('uploads', 'billing', String(proposal.project), filename)
  await generateBillingPdf(document.toObject(), client, project, storagePath)

  const buffer = await fsp.readFile(path.resolve(process.cwd(), storagePath))
  const documentHash = crypto.createHash('sha256').update(buffer).digest('hex')

  document.pdfStoragePath = storagePath
  await document.save()

  await ProjectItem.create({
    project: proposal.project,
    type: 'CAHIER_DES_CHARGES',
    title: `Cahier des charges — ${proposal.title}`,
    content: proposal.specification.content,
    isVisible: true,
    isDownloadable: false,
    order: 0,
    createdBy: proposal.createdBy,
  })

  await QuoteProposal.findByIdAndUpdate(proposal._id, {
    billingDocument: document._id,
    'signature.documentHash': documentHash,
  })

  return document
}
