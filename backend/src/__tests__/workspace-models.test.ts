import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import WorkspaceLayout from '../models/WorkspaceLayout.js'
import PersonalTask from '../models/PersonalTask.js'
import WorkspaceNote from '../models/WorkspaceNote.js'

beforeAll(async () => {
  await setupMongo()
  await WorkspaceLayout.init()
})
afterAll(teardownMongo)
beforeEach(clearDb)

const userId = () => new mongoose.Types.ObjectId()

describe('WorkspaceLayout', () => {
  it('applique les valeurs par défaut', async () => {
    const doc = await WorkspaceLayout.create({ userId: userId() })
    expect(doc.widgets).toEqual([])
    expect(doc.shortcuts).toEqual([])
    expect(doc.dailyGoal).toBeNull()
  })
  it('impose unicité par userId', async () => {
    const uid = userId()
    await WorkspaceLayout.create({ userId: uid })
    await expect(WorkspaceLayout.create({ userId: uid })).rejects.toThrow()
  })
})

describe('PersonalTask', () => {
  it('défaut status=A_FAIRE, priority=NORMALE', async () => {
    const doc = await PersonalTask.create({ userId: userId(), title: 'Test' })
    expect(doc.status).toBe('A_FAIRE')
    expect(doc.priority).toBe('NORMALE')
    expect(doc.isArchived).toBe(false)
  })
  it('refuse un status invalide', async () => {
    await expect(PersonalTask.create({ userId: userId(), title: 'X', status: 'NOPE' as never })).rejects.toThrow()
  })
})

describe('WorkspaceNote', () => {
  it('crée une note de chaque type', async () => {
    const uid = userId()
    for (const type of ['NOTE', 'POSTIT', 'DRAFT', 'IDEA'] as const) {
      const doc = await WorkspaceNote.create({ userId: uid, type })
      expect(doc.type).toBe(type)
      expect(doc.status).toBe('NEW')
    }
  })
})
