import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import ChangeRequest from '../models/ChangeRequest.js'

const someId = () => new mongoose.Types.ObjectId()

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)

describe('modèle ChangeRequest', () => {
  it('applique les valeurs par défaut du cycle de vie', async () => {
    const clientId = someId()
    const created = await ChangeRequest.create({
      client: clientId,
      title: 'Corriger le formulaire de contact',
      description: 'Le champ téléphone refuse les numéros étrangers.',
      createdBy: clientId,
      createdByName: 'Claire Corbel',
    })

    expect(created.status).toBe('SOUMISE')
    expect(created.priority).toBe('NORMALE')
    expect(created.project).toBeNull()
    expect(created.qualification).toBeNull()
    expect(created.quoteProposal).toBeNull()
    expect(created.refusalReason).toBe('')
    expect(created.pageUrl).toBe('')
    expect(created.attachments).toEqual([])
    expect(created.replies).toEqual([])
    expect(created.statusHistory).toEqual([])
    expect(created.deliveredAt).toBeNull()
    expect(created.validatedAt).toBeNull()
  })

  it('exige un compte client, un titre et une description', async () => {
    await expect(ChangeRequest.create({ title: 'x', description: 'y' })).rejects.toThrow()
    await expect(
      ChangeRequest.create({ client: someId(), description: 'y', createdBy: someId(), createdByName: 'A' }),
    ).rejects.toThrow()
    await expect(
      ChangeRequest.create({ client: someId(), title: 'x', createdBy: someId(), createdByName: 'A' }),
    ).rejects.toThrow()
  })

  it('refuse un statut, une priorité ou une qualification hors énumération', async () => {
    const base = { client: someId(), title: 'x', description: 'y', createdBy: someId(), createdByName: 'A' }
    await expect(ChangeRequest.create({ ...base, status: 'EN_ATTENTE' })).rejects.toThrow()
    await expect(ChangeRequest.create({ ...base, priority: 'URGENTE' })).rejects.toThrow()
    await expect(ChangeRequest.create({ ...base, qualification: 'PLANIFIEE' })).rejects.toThrow()
  })

  it('embarque pièces jointes, réponses horodatées et historique de statut', async () => {
    const clientId = someId()
    const created = await ChangeRequest.create({
      client: clientId,
      title: 'Nouvelle page « Ateliers »',
      description: 'Présenter le calendrier des ateliers.',
      createdBy: clientId,
      createdByName: 'Claire Corbel',
      attachments: [{ filename: '1-plan.pdf', originalName: 'plan.pdf', mimetype: 'application/pdf', size: 2048 }],
      replies: [{ authorId: clientId, authorName: 'Claire Corbel', message: 'Merci !', attachments: [] }],
      statusHistory: [{ status: 'SOUMISE', at: new Date(), byUserId: clientId, byName: 'Claire Corbel' }],
    })

    expect(created.attachments[0]!.originalName).toBe('plan.pdf')
    // _id: false sur le sous-schéma fichier — un fichier n'est pas une entité.
    expect((created.attachments[0] as unknown as { _id?: unknown })._id).toBeUndefined()
    expect(created.replies[0]!.createdAt).toBeInstanceOf(Date)
    expect(created.statusHistory[0]!.status).toBe('SOUMISE')
    expect(created.statusHistory[0]!.note).toBe('')
  })

  it('indexe la file admin et le lookup du hook signature', () => {
    const indexes = ChangeRequest.schema.indexes().map(([fields]) => Object.keys(fields).join(','))
    expect(indexes).toContain('client,status,createdAt')
    expect(indexes).toContain('status,createdAt')
    expect(indexes).toContain('project')
    expect(indexes).toContain('quoteProposal')
  })
})
