import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from '../../../__tests__/helpers/mongoTestEnv.js'
import MissionBrief from '../../../models/MissionBrief.js'
import { getBriefP1Items } from './briefs.js'

beforeAll(async () => { await setupMongo() })
afterAll(async () => { await teardownMongo() })
beforeEach(async () => { await clearDb() })

describe('getBriefP1Items', () => {
  it('retourne uniquement les P1 dépassés et non terminés', async () => {
    const userId = new mongoose.Types.ObjectId()
    const projectId = new mongoose.Types.ObjectId()
    const createdById = new mongoose.Types.ObjectId()
    const past = new Date(Date.now() - 86400 * 1000)
    const future = new Date(Date.now() + 86400 * 1000)

    const base = {
      project: projectId,
      destinataire: userId,
      createdBy: createdById,
      intitule: 'Brief test',
    }

    await MissionBrief.create({ ...base, briefPriority: 'P1', deadline: past,   statut: 'A_FAIRE' })  // ✓ inclus
    await MissionBrief.create({ ...base, briefPriority: 'P1', deadline: future, statut: 'A_FAIRE' })  // skip (futur)
    await MissionBrief.create({ ...base, briefPriority: 'P2', deadline: past,   statut: 'A_FAIRE' })  // skip (P2)
    await MissionBrief.create({ ...base, briefPriority: 'P1', deadline: past,   statut: 'VALIDE'  })  // skip (terminé)
    await MissionBrief.create({ ...base, briefPriority: 'P1', deadline: past,   statut: 'LIVRE'   })  // skip (terminé)

    const items = await getBriefP1Items(userId.toString())

    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('brief')
    expect(items[0].tag.label).toBe('P1')
    expect(items[0].title).toBe('Brief test')
    expect(items[0].id).toMatch(/^brief:/)
    expect(items[0].urgency).toBeGreaterThan(0)
    expect(items[0].link).toMatch(/^\/admin\/briefs\//)
  })

  it('exclut les briefs d\'un autre utilisateur', async () => {
    const userId = new mongoose.Types.ObjectId()
    const otherUserId = new mongoose.Types.ObjectId()
    const projectId = new mongoose.Types.ObjectId()
    const createdById = new mongoose.Types.ObjectId()
    const past = new Date(Date.now() - 86400 * 1000)

    await MissionBrief.create({
      project: projectId,
      destinataire: otherUserId,
      createdBy: createdById,
      intitule: 'Brief autre user',
      briefPriority: 'P1',
      deadline: past,
      statut: 'A_FAIRE',
    })

    const items = await getBriefP1Items(userId.toString())
    expect(items).toHaveLength(0)
  })
})
