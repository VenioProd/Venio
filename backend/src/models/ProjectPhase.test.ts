import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from '../__tests__/helpers/mongoTestEnv.js'
import ProjectPhase from './ProjectPhase.js'

beforeAll(async () => {
  await setupMongo()
})
afterAll(async () => {
  await teardownMongo()
})
beforeEach(async () => {
  await clearDb()
})

const baseFields = () => ({
  project: new mongoose.Types.ObjectId(),
  title: 'Maquettes',
  createdBy: new mongoose.Types.ObjectId(),
})

describe('ProjectPhase', () => {
  it('applique les valeurs par défaut du pipeline', async () => {
    const phase = await ProjectPhase.create(baseFields())

    expect(phase.status).toBe('A_VENIR')
    expect(phase.order).toBe(0)
    expect(phase.description).toBe('')
    expect(phase.dueAt).toBeNull()
    expect(phase.requiresClientValidation).toBe(false)
    expect(phase.linkedItems).toHaveLength(0)
    expect(phase.revisionRequests).toHaveLength(0)
    expect(phase.validation.validatedAt).toBeNull()
    expect(phase.validation.validatedBy).toBeNull()
    expect(phase.validation.validatedByName).toBe('')
    expect(phase.validation.comment).toBe('')
  })

  it('refuse un statut hors enum', async () => {
    await expect(ProjectPhase.create({ ...baseFields(), status: 'BROUILLON' })).rejects.toThrow()
  })

  it('exige project, title et createdBy', async () => {
    await expect(ProjectPhase.create({ title: 'Orpheline' })).rejects.toThrow()
  })

  it('stocke une validation nominative horodatée', async () => {
    const validator = new mongoose.Types.ObjectId()
    const validatedAt = new Date('2026-08-20T10:00:00.000Z')
    const phase = await ProjectPhase.create({
      ...baseFields(),
      status: 'TERMINEE',
      validation: { validatedBy: validator, validatedByName: 'Claire Corbel', validatedAt, comment: 'Parfait' },
    })

    const reloaded = await ProjectPhase.findById(phase._id)
    expect(String(reloaded!.validation.validatedBy)).toBe(String(validator))
    expect(reloaded!.validation.validatedByName).toBe('Claire Corbel')
    expect(reloaded!.validation.validatedAt!.toISOString()).toBe(validatedAt.toISOString())
    expect(reloaded!.validation.comment).toBe('Parfait')
  })

  it('empile des demandes de retouches identifiées et horodatées', async () => {
    const author = new mongoose.Types.ObjectId()
    const phase = await ProjectPhase.create(baseFields())
    phase.revisionRequests.push({
      requestedBy: author,
      requestedByName: 'Claire Corbel',
      comment: 'Le header est trop dense',
    } as never)
    await phase.save()

    const reloaded = await ProjectPhase.findById(phase._id)
    expect(reloaded!.revisionRequests).toHaveLength(1)
    const revision = reloaded!.revisionRequests[0]
    expect(revision._id).toBeDefined()
    expect(revision.comment).toBe('Le header est trop dense')
    expect(revision.requestedByName).toBe('Claire Corbel')
    expect(revision.createdAt).toBeInstanceOf(Date)
    expect(revision.resolvedAt).toBeNull()
    expect(revision.resolvedBy).toBeNull()
  })

  it('exige un commentaire sur une demande de retouches', async () => {
    const phase = await ProjectPhase.create(baseFields())
    phase.revisionRequests.push({ requestedBy: new mongoose.Types.ObjectId(), requestedByName: 'X' } as never)
    await expect(phase.save()).rejects.toThrow()
  })

  it('indexe le tri par projet et ordre', () => {
    const indexes = ProjectPhase.schema.indexes()
    expect(indexes.some(([fields]) => fields.project === 1 && fields.order === 1)).toBe(true)
  })
})
