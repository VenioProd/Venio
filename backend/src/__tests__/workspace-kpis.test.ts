import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { computeRoleKpis } from '../services/workspaceKpis.js'

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)

describe('computeRoleKpis', () => {
  it('retourne un tableau (label, value, link) pour COMMERCIAL', async () => {
    const kpis = await computeRoleKpis(new mongoose.Types.ObjectId().toString(), 'COMMERCIAL')
    expect(Array.isArray(kpis)).toBe(true)
    for (const k of kpis) {
      expect(k).toHaveProperty('label')
      expect(k).toHaveProperty('value')
      expect(k).toHaveProperty('link')
      expect(typeof k.value).toBe('number')
    }
  })
  it('retourne un tableau pour chaque rôle back-office sans planter', async () => {
    const roles = ['ADMIN', 'MANAGER', 'RH', 'COMMERCIAL', 'COMPTABLE', 'VIEWER', 'STAGIAIRE', 'SUPER_ADMIN'] as const
    for (const role of roles) {
      const kpis = await computeRoleKpis(new mongoose.Types.ObjectId().toString(), role)
      expect(Array.isArray(kpis)).toBe(true)
    }
  })
})
