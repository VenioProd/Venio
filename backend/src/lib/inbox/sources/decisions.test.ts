import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from '../../../__tests__/helpers/mongoTestEnv.js'
import Decision from '../../../models/Decision.js'
import { getDecisionItems } from './decisions.js'

beforeAll(async () => { await setupMongo() })
afterAll(async () => { await teardownMongo() })
beforeEach(async () => { await clearDb() })

describe('getDecisionItems', () => {
  it('retourne uniquement les décisions PENDING avec format InboxItem', async () => {
    const submitter = new mongoose.Types.ObjectId()
    await Decision.create([
      { title: 'A', status: 'PENDING', priority: 'URGENTE', category: 'BUDGET', submittedBy: submitter, submittedByName: 'Sarah', description: 'x' },
      { title: 'B', status: 'APPROVED', priority: 'NORMALE', category: 'BUDGET', submittedBy: submitter, submittedByName: 'Sarah', description: 'x' },
    ])
    const items = await getDecisionItems()
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('A')
    expect(items[0].type).toBe('decision')
    expect(items[0].tag.label).toBe('URG')
    expect(items[0].id).toBe(`decision:${items[0].sourceId}`)
    expect(items[0].actions.some((a) => a.kind === 'approve')).toBe(true)
    expect(items[0].actions.some((a) => a.kind === 'reject')).toBe(true)
    expect(items[0].link).toContain('/admin/decisions/')
  })

  it('utilise le bon tag par priorité', async () => {
    const submitter = new mongoose.Types.ObjectId()
    await Decision.create([
      { title: 'urg', status: 'PENDING', priority: 'URGENTE', category: 'BUDGET', submittedBy: submitter, submittedByName: 'x', description: 'x' },
      { title: 'hau', status: 'PENDING', priority: 'HAUTE', category: 'BUDGET', submittedBy: submitter, submittedByName: 'x', description: 'x' },
      { title: 'nor', status: 'PENDING', priority: 'NORMALE', category: 'BUDGET', submittedBy: submitter, submittedByName: 'x', description: 'x' },
    ])
    const items = await getDecisionItems()
    expect(items.find(i => i.title === 'urg')?.tag.label).toBe('URG')
    expect(items.find(i => i.title === 'hau')?.tag.label).toBe('HAUTE')
    expect(items.find(i => i.title === 'nor')?.tag.label).toBe('NORM')
  })
})
