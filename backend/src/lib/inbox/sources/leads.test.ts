import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from '../../../__tests__/helpers/mongoTestEnv.js'
import Lead from '../../../models/Lead.js'
import { getLeadItems } from './leads.js'

beforeAll(async () => { await setupMongo() })
afterAll(async () => { await teardownMongo() })
beforeEach(async () => { await clearDb() })

// Fake ObjectId to satisfy the required `createdBy` field
const fakeUserId = new mongoose.Types.ObjectId()

describe('getLeadItems', () => {
  it('inclut les hot leads non contactés depuis 7j+', async () => {
    const past8d = new Date(Date.now() - 8 * 86400 * 1000)
    const yesterday = new Date(Date.now() - 86400 * 1000)

    await Lead.create([
      // INCLUDE: CHAUD, open, nextActionAt 8 days ago (> 7d cutoff)
      { leadTemperature: 'CHAUD', status: 'LEAD', budget: 35000, nextActionAt: past8d, company: 'Studio Lumen', createdBy: fakeUserId },
      // SKIP: CHAUD, open, but nextActionAt is only yesterday (< 7d)
      { leadTemperature: 'CHAUD', status: 'LEAD', budget: 10000, nextActionAt: yesterday, company: 'Recent', createdBy: fakeUserId },
      // SKIP: FROID, not hot
      { leadTemperature: 'FROID', status: 'LEAD', budget: 5000, nextActionAt: past8d, company: 'Cold lead', createdBy: fakeUserId },
      // INCLUDE: TRES_CHAUD, open, no nextActionAt at all
      { leadTemperature: 'TRES_CHAUD', status: 'LEAD', budget: 50000, company: 'Never contacted', createdBy: fakeUserId },
      // SKIP: CHAUD but status WON
      { leadTemperature: 'CHAUD', status: 'WON', budget: 20000, nextActionAt: past8d, company: 'Won lead', createdBy: fakeUserId },
    ] as any)

    const items = await getLeadItems()
    expect(items.length).toBe(2)

    const titles = items.map(i => i.title).sort()
    expect(titles[0]).toMatch(/Never contacted/)
    expect(titles[1]).toMatch(/Studio Lumen/)
    expect(items.every(i => i.type === 'lead')).toBe(true)
    expect(items.every(i => i.tag.label === 'CRM')).toBe(true)
  })

  it('retourne un tableau vide quand aucun lead chaud', async () => {
    await Lead.create([
      { leadTemperature: 'FROID', status: 'LEAD', company: 'Cold', createdBy: fakeUserId },
      { leadTemperature: 'TIEDE', status: 'LEAD', company: 'Warm', createdBy: fakeUserId },
    ] as any)

    const items = await getLeadItems()
    expect(items.length).toBe(0)
  })

  it('exclut les leads WON et LOST même si chauds', async () => {
    const past8d = new Date(Date.now() - 8 * 86400 * 1000)
    await Lead.create([
      { leadTemperature: 'TRES_CHAUD', status: 'WON', company: 'Won hot', createdBy: fakeUserId, nextActionAt: past8d },
      { leadTemperature: 'CHAUD', status: 'LOST', company: 'Lost hot', createdBy: fakeUserId, nextActionAt: past8d },
    ] as any)

    const items = await getLeadItems()
    expect(items.length).toBe(0)
  })
})
