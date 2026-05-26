import { describe, it, expect } from 'vitest'
import { evaluatePulseRules, PulseContext } from './pulseRules.js'

const baseCtx: PulseContext = {
  monthlyCA: 45000,
  caObjective: 60000,
  pipelinePrev30: 100000,
  pipelineCurrent: 128000,
  hotLeadsNeglected: 0,
  adminLoads: [],
  briefsP1Overdue: 0,
  lastBackupAt: new Date(),
  qualiopiExpiringWithin30Days: 0,
}

describe('evaluatePulseRules', () => {
  it('CA on-track = ok quand >= 70% objectif', async () => {
    const r = await evaluatePulseRules({ ...baseCtx, monthlyCA: 42000, caObjective: 60000 })
    expect(r.find((c) => c.id === 'ca-on-track')?.status).toBe('ok')
  })

  it('CA = warn entre 40 et 70%', async () => {
    const r = await evaluatePulseRules({ ...baseCtx, monthlyCA: 30000, caObjective: 60000 })
    expect(r.find((c) => c.id === 'ca-on-track')?.status).toBe('warn')
  })

  it('CA = bad < 40%', async () => {
    const r = await evaluatePulseRules({ ...baseCtx, monthlyCA: 20000, caObjective: 60000 })
    expect(r.find((c) => c.id === 'ca-on-track')?.status).toBe('bad')
  })

  it('Pipeline growing = ok si delta positif', async () => {
    const r = await evaluatePulseRules({ ...baseCtx, pipelinePrev30: 100, pipelineCurrent: 110 })
    expect(r.find((c) => c.id === 'pipeline-growing')?.status).toBe('ok')
  })

  it('hot leads neglected: 0 = ok, 1-3 = warn, 4+ = bad', async () => {
    const a = await evaluatePulseRules({ ...baseCtx, hotLeadsNeglected: 0 })
    const b = await evaluatePulseRules({ ...baseCtx, hotLeadsNeglected: 2 })
    const c = await evaluatePulseRules({ ...baseCtx, hotLeadsNeglected: 5 })
    expect(a.find((x) => x.id === 'hot-leads-followup')?.status).toBe('ok')
    expect(b.find((x) => x.id === 'hot-leads-followup')?.status).toBe('warn')
    expect(c.find((x) => x.id === 'hot-leads-followup')?.status).toBe('bad')
  })

  it('team-balanced: bad si 2+ admins > 10 tâches', async () => {
    const r = await evaluatePulseRules({
      ...baseCtx,
      adminLoads: [{ name: 'A', total: 12 }, { name: 'B', total: 14 }, { name: 'C', total: 5 }],
    })
    expect(r.find((x) => x.id === 'team-balanced')?.status).toBe('bad')
  })

  it('backup-success: bad si > 48h ou null', async () => {
    const r1 = await evaluatePulseRules({ ...baseCtx, lastBackupAt: null })
    const r2 = await evaluatePulseRules({ ...baseCtx, lastBackupAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) })
    expect(r1.find((x) => x.id === 'backup-success')?.status).toBe('bad')
    expect(r2.find((x) => x.id === 'backup-success')?.status).toBe('bad')
  })

  it('qualiopi: warn si 1+ signature expire < 30j', async () => {
    const r = await evaluatePulseRules({ ...baseCtx, qualiopiExpiringWithin30Days: 2 })
    expect(r.find((x) => x.id === 'qualiopi-compliant')?.status).toBe('warn')
  })

  it('briefs-p1-on-time: ok=0, warn=1, bad=2+', async () => {
    const r0 = await evaluatePulseRules({ ...baseCtx, briefsP1Overdue: 0 })
    const r1 = await evaluatePulseRules({ ...baseCtx, briefsP1Overdue: 1 })
    const r2 = await evaluatePulseRules({ ...baseCtx, briefsP1Overdue: 3 })
    expect(r0.find((x) => x.id === 'briefs-p1-on-time')?.status).toBe('ok')
    expect(r1.find((x) => x.id === 'briefs-p1-on-time')?.status).toBe('warn')
    expect(r2.find((x) => x.id === 'briefs-p1-on-time')?.status).toBe('bad')
  })

  it('retourne toujours les 7 règles', async () => {
    const r = await evaluatePulseRules(baseCtx)
    expect(r).toHaveLength(7)
    const ids = r.map((c) => c.id).sort()
    expect(ids).toEqual([
      'backup-success', 'briefs-p1-on-time', 'ca-on-track',
      'hot-leads-followup', 'pipeline-growing', 'qualiopi-compliant', 'team-balanced',
    ])
  })
})
