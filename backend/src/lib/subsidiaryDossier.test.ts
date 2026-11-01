import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import Subsidiary from '../models/Subsidiary.js'
import Lead from '../models/Lead.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import ArrowPilotage from '../models/ArrowPilotage.js'
import { migrateArrowPilotageToSubsidiary } from '../scripts/migrateArrowPilotageToSubsidiary.js'
const cloud = vi.hoisted(() => ({ enabled: true, createFolder: vi.fn() }))
vi.mock('./nextcloud.js', () => ({
  isNextcloudEnabled: () => cloud.enabled,
  createFolder: cloud.createFolder,
  syncUploadToNextcloud: vi.fn(),
}))
import { provisionSubsidiaryCloud, subsidiaryCrm, subsidiaryDev } from './subsidiaryDossier.js'
import router from '../routes/admin/subsidiaries.js'
function query(value: unknown): any {
  const q: any = {}
  for (const method of ['select', 'populate', 'sort', 'limit']) q[method] = vi.fn(() => q)
  q.lean = vi.fn().mockResolvedValue(value)
  return q
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
beforeEach(() => {
  cloud.enabled = true
  cloud.createFolder.mockReset().mockResolvedValue({ success: true })
  vi.stubEnv('NEXTCLOUD_URL', 'https://cloud.test')
})
const base = () => ({ name: 'Arrow', slug: 'arrow', createdBy: new mongoose.Types.ObjectId() })

describe('Subsidiary schema without database', () => {
  it('defaults structured data', () => {
    const sub = new Subsidiary({ ...base(), features: [{ name: 'Export' }], pricing: [{ label: 'Pro' }] })
    expect(sub.validateSync()).toBeUndefined()
    expect(sub.features[0].status).toBe('PREVUE')
    expect(sub.pricing[0]).toMatchObject({ amount: 0, kind: 'ABONNEMENT', period: 'MOIS' })
    expect(sub.pilotage.goals).toEqual([])
    expect(sub.nextcloud.url).toBe('')
  })
  it.each([
    { features: [{ name: 'x', status: 'BAD' }] },
    { features: [{ name: 'x'.repeat(161) }] },
    { pricing: [{ label: 'Pro', amount: -1 }] },
    { pricing: [{ label: 'Pro', period: 'BAD' }] },
    { competitors: [{ name: 'Bad', url: 'javascript:alert(1)' }] },
    { nextcloud: { url: 'ftp://cloud.test' } },
    { leadProject: 'YUMI' },
    { devProject: 'bad' },
    { target: 'x'.repeat(6001) },
    { valueProposition: 'x'.repeat(6001) },
    { salesPitch: 'x'.repeat(6001) },
    { objections: [{ question: 'x', answer: 'x'.repeat(6001) }] },
    { pilotage: { goals: ['x'.repeat(4001)] } },
  ])('rejects invalid data %#', (data) => expect(new Subsidiary({ ...base(), ...data }).validateSync()).toBeDefined())
  it('accepts HTTP and HTTPS competitor links', () => {
    expect(
      new Subsidiary({
        ...base(),
        competitors: [
          { name: 'A', url: 'https://example.com' },
          { name: 'B', url: 'http://example.com' },
        ],
      }).validateSync(),
    ).toBeUndefined()
  })
})
describe('CRM summaries', () => {
  it('queries only the matching project and hot open leads, and returns ordered results and signed accounts', async () => {
    const find = vi
      .spyOn(Lead, 'find')
      .mockReturnValueOnce(
        query([
          {
            _id: 'a',
            company: 'Hot',
            leadTemperature: 'CHAUD',
            score: 100,
            budget: 500,
            assignedTo: { name: 'Owner' },
          },
          { _id: 'b', company: 'Very hot', leadTemperature: 'TRES_CHAUD', score: 10 },
          { _id: 'c', company: 'Very hot higher', leadTemperature: 'TRES_CHAUD', score: 20 },
        ]),
      )
      .mockReturnValueOnce(
        query([
          {
            _id: 'signed',
            company: 'Signed',
            statusChangedAt: new Date('2026-10-01'),
            budget: 5000,
            serviceType: 'Pro',
            clientAccountId: { _id: 'account', name: 'Client' },
          },
        ]),
      )
    const result = await subsidiaryCrm('ARROW')
    expect(find).toHaveBeenNthCalledWith(1, {
      project: 'ARROW',
      status: { $nin: ['WON', 'LOST'] },
      leadTemperature: { $in: ['TRES_CHAUD', 'CHAUD'] },
    })
    expect(find).toHaveBeenNthCalledWith(2, { project: 'ARROW', status: 'WON' })
    expect(result.hotProspects.map((l) => l.company)).toEqual(['Very hot higher', 'Very hot', 'Hot'])
    expect(result.signedClients[0]).toMatchObject({
      href: '/admin/crm/leads/signed',
      clientHref: '/admin/comptes-clients/account',
      serviceType: 'Pro',
      budget: 5000,
    })
    expect(result.indicators).toEqual({ signedClients: 1, hotProspects: 3, weightedPipeline: null, estimatedMrr: null })
  })
  it('does not aggregate historical unassigned leads', async () => {
    const find = vi.spyOn(Lead, 'find')
    expect((await subsidiaryCrm('')).indicators.hotProspects).toBe(0)
    expect(find).not.toHaveBeenCalled()
  })
})
describe('Dev summary', () => {
  it('excludes archived and closed issues and limits the latest list to five', async () => {
    vi.spyOn(DevProject, 'findById').mockReturnValue(query({ _id: 'project', key: 'AR', name: 'Arrow' }))
    const counts = vi
      .spyOn(DevIssue, 'countDocuments')
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
    const issues = query([{ _id: 'issue', identifier: 'AR-1', title: 'Ship' }])
    vi.spyOn(DevIssue, 'find').mockReturnValue(issues)
    const result = await subsidiaryDev('project')
    expect(result?.counts).toEqual({ open: 7, inProgress: 2, done: 3 })
    expect(counts.mock.calls[0][0]).toMatchObject({
      archivedAt: null,
      status: { $nin: ['DONE', 'CANCELLED', 'DUPLICATE'] },
    })
    expect(issues.limit).toHaveBeenCalledWith(5)
    expect(result?.issues[0].href).toBe('/admin/dev/issues/issue')
  })
})
describe('Nextcloud endpoint without sockets', () => {
  // Execute the registered route callback; integration suite exercises auth and Mongoose as well.
  const handler = (router as any).stack.find((layer: any) => layer.route?.path === '/:id/nextcloud').route.stack[0]
    .handle
  function response() {
    const res: any = {}
    res.status = vi.fn(() => res)
    res.json = vi.fn(() => res)
    return res
  }
  it('creates useful folders and persists the resulting path and URL', async () => {
    const sub = { name: 'Arrow', nextcloud: { path: '', url: '' }, save: vi.fn() }
    vi.spyOn(Subsidiary, 'findById').mockResolvedValue(sub as any)
    const res = response()
    const next = vi.fn()
    await handler({ params: { id: 'arrow' } }, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(cloud.createFolder.mock.calls.map((c) => c[0])).toEqual([
      '/Plateformes',
      '/Plateformes/Arrow',
      '/Plateformes/Arrow/Commercial',
      '/Plateformes/Arrow/Juridique',
      '/Plateformes/Arrow/Produit',
      '/Plateformes/Arrow/Marketing',
    ])
    expect(sub.save).toHaveBeenCalledOnce()
    expect(res.json).toHaveBeenCalledWith({
      nextcloud: { path: '/Plateformes/Arrow', url: 'https://cloud.test/apps/files/?dir=%2FPlateformes%2FArrow' },
    })
  })
  it('returns 503 for missing configuration and 502 for partial provisioning', async () => {
    const sub = { name: 'Arrow', nextcloud: { path: '' }, save: vi.fn() }
    vi.spyOn(Subsidiary, 'findById').mockResolvedValue(sub as any)
    cloud.enabled = false
    let res = response()
    await handler({ params: { id: 'arrow' } }, res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(503)
    expect(sub.save).not.toHaveBeenCalled()
    cloud.enabled = true
    cloud.createFolder.mockResolvedValue({ success: false })
    res = response()
    await handler({ params: { id: 'arrow' } }, res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(502)
    expect(sub.save).not.toHaveBeenCalled()
  })
  it('is repeatable and sanitizes platform names', async () => {
    cloud.createFolder.mockResolvedValue({ success: false, alreadyExists: true })
    expect((await provisionSubsidiaryCloud('../Arrow/Test')).path).toBe('/Plateformes/-Arrow-Test')
  })
})
describe('Pilotage migration', () => {
  it('supports dry run and idempotence with an atomic empty-target condition', async () => {
    vi.spyOn(ArrowPilotage, 'findOne').mockReturnValue(
      query({ goals: ['Ship'], scorecard: [], decisions: [], cadence: ['Weekly'] }),
    )
    const target = { _id: 'arrow', pilotage: { goals: [], scorecard: [], decisions: [], cadence: [] } }
    vi.spyOn(Subsidiary, 'findOne').mockReturnValue(query(target))
    const update = vi.spyOn(Subsidiary, 'updateOne').mockImplementation((...args: any[]) => {
      const [filter, change] = args
      expect(filter.$and).toHaveLength(4)
      target.pilotage = change.$set.pilotage
      return Promise.resolve({ modifiedCount: 1 }) as any
    })
    expect((await migrateArrowPilotageToSubsidiary(true)).status).toBe('would-migrate')
    expect(update).not.toHaveBeenCalled()
    expect((await migrateArrowPilotageToSubsidiary()).modified).toBe(1)
    expect((await migrateArrowPilotageToSubsidiary()).modified).toBe(0)
    expect(update).toHaveBeenCalledOnce()
    expect(target.pilotage.cadence).toEqual(['Weekly'])
  })
})
