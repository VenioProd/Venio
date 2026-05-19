import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from '../__tests__/helpers/mongoTestEnv.js'
import InboxPin from './InboxPin.js'

beforeAll(async () => { await setupMongo() })
afterAll(async () => { await teardownMongo() })
beforeEach(async () => { await clearDb() })

describe('InboxPin', () => {
  it('crée un pin avec snapshot du titre et du lien', async () => {
    const p = await InboxPin.create({
      userId: new mongoose.Types.ObjectId(),
      refType: 'project',
      refId: new mongoose.Types.ObjectId(),
      title: 'Projet Acme',
      link: '/admin/projets/xxx',
    })
    expect(p._id).toBeDefined()
    expect(p.title).toBe('Projet Acme')
    expect(p.link).toBe('/admin/projets/xxx')
  })

  it('accepte color et expiresAt optionnels', async () => {
    const future = new Date(Date.now() + 86400 * 1000)
    const p = await InboxPin.create({
      userId: new mongoose.Types.ObjectId(),
      refType: 'client',
      refId: new mongoose.Types.ObjectId(),
      title: 'Client',
      link: '/admin/clients/xxx',
      color: '#ff0080',
      expiresAt: future,
    })
    expect(p.color).toBe('#ff0080')
    expect(p.expiresAt?.getTime()).toBe(future.getTime())
  })

  it('rejette si title ou link manquant', async () => {
    await expect(
      InboxPin.create({
        userId: new mongoose.Types.ObjectId(),
        refType: 'project',
        refId: new mongoose.Types.ObjectId(),
      } as any)
    ).rejects.toThrow()
  })
})
