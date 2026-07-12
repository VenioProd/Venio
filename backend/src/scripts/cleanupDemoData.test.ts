import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from '../__tests__/helpers/mongoTestEnv.js'
import ClientActivity from '../models/ClientActivity.js'
import Lead from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'
import Project from '../models/Project.js'
import User from '../models/User.js'
import {
  assertDemoCleanupAllowed,
  cleanupDemoData,
  hasDryRunFlag,
} from './cleanupDemoData.js'

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)

async function seedCleanupFixtures(): Promise<void> {
  const [demoUser, retainedUser] = await User.create([
    { email: 'demo@venio.com', passwordHash: 'hash', role: 'CLIENT', name: 'Demo' },
    { email: 'client@example.com', passwordHash: 'hash', role: 'CLIENT', name: 'Client' },
  ])

  const [demoLead, retainedLead] = await Lead.create([
    { company: 'TechVision SAS' },
    { company: 'Client réel' },
  ])

  await Project.create([
    { name: 'Projet démo', client: demoUser._id },
    { name: 'Projet fictif', client: retainedUser._id, internalNotes: 'Projet seed' },
    { name: 'Projet conservé', client: retainedUser._id },
  ])
  await ClientActivity.create([
    { clientId: demoUser._id, type: 'NOTE', label: 'Démo' },
    { clientId: retainedUser._id, type: 'NOTE', label: 'Conserver' },
  ])
  await LeadActivity.create([
    { leadId: demoLead._id, type: 'NOTE', label: 'Démo' },
    { leadId: retainedLead._id, type: 'NOTE', label: 'Conserver' },
  ])
}

describe('cleanupDemoData', () => {
  it('requires an explicit confirmation and recognises the dry-run flag', () => {
    expect(() => assertDemoCleanupAllowed('')).toThrow('Set ALLOW_DEMO_CLEANUP=true')
    expect(() => assertDemoCleanupAllowed('true')).not.toThrow()
    expect(hasDryRunFlag(['node', 'cleanupDemoData.ts', '--dry-run'])).toBe(true)
    expect(hasDryRunFlag(['node', 'cleanupDemoData.ts'])).toBe(false)
  })

  it('lists the cleanup candidates in dry-run mode without deleting them', async () => {
    await seedCleanupFixtures()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await cleanupDemoData({ dryRun: true, allowDemoCleanup: 'true' })

    expect(await User.countDocuments()).toBe(2)
    expect(await Project.countDocuments()).toBe(3)
    expect(await Lead.countDocuments()).toBe(2)
    expect(await ClientActivity.countDocuments()).toBe(2)
    expect(await LeadActivity.countDocuments()).toBe(2)
    expect(log).toHaveBeenCalledWith('✅ DRY RUN terminé — aucune donnée n\'a été modifiée.')
    log.mockRestore()
  })

  it('deletes only the configured demo data when explicitly confirmed', async () => {
    await seedCleanupFixtures()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await cleanupDemoData({ dryRun: false, allowDemoCleanup: 'true' })

    expect(await User.findOne({ email: 'demo@venio.com' })).toBeNull()
    expect(await User.findOne({ email: 'client@example.com' })).not.toBeNull()
    expect(await Project.countDocuments()).toBe(1)
    expect(await Project.findOne({ name: 'Projet conservé' })).not.toBeNull()
    expect(await Lead.findOne({ company: 'TechVision SAS' })).toBeNull()
    expect(await Lead.findOne({ company: 'Client réel' })).not.toBeNull()
    expect(await ClientActivity.countDocuments()).toBe(1)
    expect(await LeadActivity.countDocuments()).toBe(1)
    log.mockRestore()
  })
})
