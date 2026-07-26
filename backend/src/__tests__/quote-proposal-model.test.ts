import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import QuoteProposal from '../models/QuoteProposal.js'
import AuditLog from '../models/AuditLog.js'

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)

describe('modèle QuoteProposal', () => {
  it('crée une proposition en DRAFT avec des lignes obligatoires et optionnelles', async () => {
    const proposal = await QuoteProposal.create({
      project: new mongoose.Types.ObjectId(),
      client: new mongoose.Types.ObjectId(),
      createdBy: new mongoose.Types.ObjectId(),
      title: 'Refonte du site',
      lines: [
        { description: 'Conception', quantity: 1, unitPrice: 2000, taxRate: 20, isOptional: false, order: 0 },
        { description: 'Rédaction', quantity: 1, unitPrice: 600, taxRate: 20, isOptional: true, order: 1 },
      ],
      questions: [{ type: 'text', label: 'Quel est votre délai ?', required: true, order: 0 }],
    })

    expect(proposal.status).toBe('DRAFT')
    expect(proposal.billingDocument).toBeNull()
    expect(proposal.lines[0]!.isOptional).toBe(false)
    expect(proposal.lines[1]!._id).toBeDefined()
    expect(proposal.specification.isManual).toBe(false)
  })

  // Les écritures de journal sont volontairement en `.catch(() => {})` pour ne
  // jamais bloquer une requête : une action absente de l'énumération d'AuditLog
  // échouerait donc en silence. Ce test verrouille les trois actions du lot.
  it('accepte les actions de journal des propositions', async () => {
    for (const action of ['QUOTE_PROPOSAL_VIEWED', 'QUOTE_PROPOSAL_SIGNED', 'QUOTE_PROPOSAL_EXPIRED']) {
      await expect(AuditLog.create({ action, metadata: { proposalId: 'x' } })).resolves.toBeDefined()
    }
  })

  it('refuse un statut hors énumération', async () => {
    await expect(
      QuoteProposal.create({
        project: new mongoose.Types.ObjectId(),
        client: new mongoose.Types.ObjectId(),
        createdBy: new mongoose.Types.ObjectId(),
        title: 'Invalide',
        status: 'PENDING',
      }),
    ).rejects.toThrow()
  })
})
