import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from '../../../__tests__/helpers/mongoTestEnv.js'
import InternalTicket from '../../../models/InternalTicket.js'
import { getTicketItems } from './tickets.js'

beforeAll(async () => { await setupMongo() })
afterAll(async () => { await teardownMongo() })
beforeEach(async () => { await clearDb() })

// InternalTicket required fields: title, message, authorId, authorName
// Status values: 'OUVERT' | 'EN_COURS' | 'RESOLU' | 'FERME'
// Priority values: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
// No `assignee` field — tickets are linked to users via `authorId`

describe('getTicketItems', () => {
  it('retourne uniquement les tickets ouverts créés par le user', async () => {
    const userId = new mongoose.Types.ObjectId()
    const otherUser = new mongoose.Types.ObjectId()

    await InternalTicket.create([
      // INCLUDE: owned by userId, status OUVERT
      { title: 'Mine open', message: 'detail', status: 'OUVERT', authorId: userId, authorName: 'Alice' },
      // SKIP: owned by userId but closed (FERME)
      { title: 'Mine ferme', message: 'detail', status: 'FERME', authorId: userId, authorName: 'Alice' },
      // SKIP: owned by userId but resolved (RESOLU)
      { title: 'Mine resolu', message: 'detail', status: 'RESOLU', authorId: userId, authorName: 'Alice' },
      // SKIP: owned by another user
      { title: 'Other open', message: 'detail', status: 'OUVERT', authorId: otherUser, authorName: 'Bob' },
    ] as any)

    const items = await getTicketItems(userId.toString())
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Mine open')
    expect(items[0].type).toBe('ticket')
    expect(items[0].tag.label).toBe('TKT')
    expect(items[0].id).toBe(`ticket:${items[0].sourceId}`)
    expect(items[0].link).toContain('/admin/tickets/')
    expect(items[0].actions.some((a) => a.kind === 'open')).toBe(true)
  })

  it('inclut les tickets EN_COURS (pas seulement OUVERT)', async () => {
    const userId = new mongoose.Types.ObjectId()

    await InternalTicket.create([
      { title: 'En cours', message: 'detail', status: 'EN_COURS', authorId: userId, authorName: 'Alice' },
      { title: 'Ouvert', message: 'detail', status: 'OUVERT', authorId: userId, authorName: 'Alice' },
    ] as any)

    const items = await getTicketItems(userId.toString())
    expect(items).toHaveLength(2)
    expect(items.every(i => i.type === 'ticket')).toBe(true)
  })

  it('retourne un tableau vide si aucun ticket ouvert pour ce user', async () => {
    const userId = new mongoose.Types.ObjectId()
    const otherUser = new mongoose.Types.ObjectId()

    await InternalTicket.create([
      { title: 'Closed', message: 'detail', status: 'FERME', authorId: userId, authorName: 'Alice' },
      { title: 'Other', message: 'detail', status: 'OUVERT', authorId: otherUser, authorName: 'Bob' },
    ] as any)

    const items = await getTicketItems(userId.toString())
    expect(items).toHaveLength(0)
  })

  it("calcule l'urgence avec la priorité URGENTE", async () => {
    const userId = new mongoose.Types.ObjectId()

    await InternalTicket.create([
      { title: 'Urgent', message: 'detail', status: 'OUVERT', priority: 'URGENTE', authorId: userId, authorName: 'Alice' },
      { title: 'Basse', message: 'detail', status: 'OUVERT', priority: 'BASSE', authorId: userId, authorName: 'Alice' },
    ] as any)

    const items = await getTicketItems(userId.toString())
    const urgent = items.find(i => i.title === 'Urgent')
    const basse = items.find(i => i.title === 'Basse')
    expect(urgent!.urgency).toBeGreaterThan(basse!.urgency)
  })
})
