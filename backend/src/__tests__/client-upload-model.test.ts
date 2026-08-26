import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import ClientUpload from '../models/ClientUpload.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import bcrypt from 'bcryptjs'

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)

describe('modèle ClientUpload', () => {
  it('crée un dépôt sans projet avec les valeurs par défaut', async () => {
    const passwordHash = await bcrypt.hash('x', 4)
    const client = await User.create({ name: 'Client', email: 'c@example.test', passwordHash, role: 'CLIENT' })

    const upload = await ClientUpload.create({
      client: client._id,
      originalName: 'logo.png',
      storagePath: 'uploads/client-files/x/1-logo.png',
      mimeType: 'image/png',
      size: 1234,
    })

    expect(upload.project).toBeNull()
    expect(upload.category).toBe('AUTRE')
    expect(upload.note).toBe('')
    expect(upload.downloadedByAdminAt).toBeNull()
    expect(upload.createdAt).toBeInstanceOf(Date)
  })

  it('rattache un projet et une catégorie explicites', async () => {
    const passwordHash = await bcrypt.hash('x', 4)
    const client = await User.create({ name: 'Client', email: 'c2@example.test', passwordHash, role: 'CLIENT' })
    const project = await Project.create({ name: 'Site vitrine', client: client._id })

    const upload = await ClientUpload.create({
      client: client._id,
      project: project._id,
      category: 'BRIEF',
      note: 'Brief v2',
      originalName: 'brief.pdf',
      storagePath: 'uploads/client-files/x/2-brief.pdf',
      mimeType: 'application/pdf',
      size: 42,
    })

    expect(String(upload.project)).toBe(String(project._id))
    expect(upload.category).toBe('BRIEF')
  })

  it('rejette une catégorie hors enum', async () => {
    const passwordHash = await bcrypt.hash('x', 4)
    const client = await User.create({ name: 'Client', email: 'c3@example.test', passwordHash, role: 'CLIENT' })

    await expect(
      ClientUpload.create({
        client: client._id,
        category: 'INVALIDE',
        originalName: 'x.png',
        storagePath: 'uploads/client-files/x/3-x.png',
        mimeType: 'image/png',
        size: 1,
      }),
    ).rejects.toThrow(mongoose.Error.ValidationError)
  })
})
