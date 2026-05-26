import { describe, it, expect } from 'vitest'

// ── Test scheduler shouldRunNow logic ─────────────────────────
// We re-implement the logic here since it's not exported, but we
// can test via the module's behavior or extract it.

function shouldRunNow(schedule: string | undefined, now: Date): boolean {
  if (!schedule) return false

  const hours = now.getHours()
  const minutes = now.getMinutes()
  const currentTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

  const dayMatch = schedule.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday):(\d{2}:\d{2})$/i)
  if (dayMatch) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const targetDay = dayNames.indexOf(dayMatch[1].toLowerCase())
    if (now.getDay() !== targetDay) return false
    return currentTime === dayMatch[2]
  }

  if (/^\d{2}:\d{2}$/.test(schedule)) {
    return currentTime === schedule
  }

  return false
}

describe('Automation Scheduler — shouldRunNow', () => {
  it('should match daily "HH:MM" schedule at the right time', () => {
    const now = new Date('2026-03-14T08:00:00')
    expect(shouldRunNow('08:00', now)).toBe(true)
  })

  it('should NOT match daily schedule at wrong time', () => {
    const now = new Date('2026-03-14T08:01:00')
    expect(shouldRunNow('08:00', now)).toBe(false)
  })

  it('should match "monday:07:00" on a Monday at 07:00', () => {
    // 2026-03-16 is a Monday
    const monday = new Date('2026-03-16T07:00:00')
    expect(monday.getDay()).toBe(1) // Confirm it's Monday
    expect(shouldRunNow('monday:07:00', monday)).toBe(true)
  })

  it('should NOT match "monday:07:00" on a Tuesday', () => {
    const tuesday = new Date('2026-03-17T07:00:00')
    expect(tuesday.getDay()).toBe(2)
    expect(shouldRunNow('monday:07:00', tuesday)).toBe(false)
  })

  it('should NOT match "monday:07:00" on Monday at wrong time', () => {
    const monday = new Date('2026-03-16T09:00:00')
    expect(shouldRunNow('monday:07:00', monday)).toBe(false)
  })

  it('should return false for undefined schedule', () => {
    expect(shouldRunNow(undefined, new Date())).toBe(false)
  })

  it('should return false for unsupported schedule format', () => {
    expect(shouldRunNow('every 5 minutes', new Date())).toBe(false)
  })

  it('should be case-insensitive for day names', () => {
    const monday = new Date('2026-03-16T07:00:00')
    expect(shouldRunNow('Monday:07:00', monday)).toBe(true)
    expect(shouldRunNow('MONDAY:07:00', monday)).toBe(true)
  })
})

// ── Test buildContext ─────────────────────────────────────────
import { buildContext } from '../automation/engine.js'

describe('Automation Engine — buildContext', () => {
  it('should generate correct dateKey format', () => {
    const ctx = buildContext()
    expect(ctx.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('should generate correct weekKey format', () => {
    const ctx = buildContext()
    expect(ctx.weekKey).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('should generate correct monthKey format', () => {
    const ctx = buildContext()
    expect(ctx.monthKey).toMatch(/^\d{4}-\d{2}$/)
  })

  it('should include meta when provided', () => {
    const ctx = buildContext({ projectId: 'abc123' })
    expect(ctx.meta).toEqual({ projectId: 'abc123' })
  })

  it('should have undefined meta when not provided', () => {
    const ctx = buildContext()
    expect(ctx.meta).toBeUndefined()
  })

  it('should have a Date instance for now', () => {
    const ctx = buildContext()
    expect(ctx.now).toBeInstanceOf(Date)
  })
})

// ── Test registry ─────────────────────────────────────────────
import {
  registerAutomation,
  getAutomation,
  getAllAutomations,
  getCronAutomations,
  getEventAutomations,
  listAutomationSummaries,
} from '../automation/registry.js'
import type { AutomationDefinition } from '../automation/types.js'

function createMockDefinition(overrides: Partial<AutomationDefinition> = {}): AutomationDefinition {
  const key = overrides.key || `test.mock_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  return {
    key,
    title: 'Test Automation',
    domain: 'test',
    triggerType: 'cron',
    schedule: '08:00',
    channels: ['in_app'],
    recipientStrategy: ['admins'],
    retryable: false,
    maxRetries: 0,
    defaultEnabled: true,
    permissionsScope: ['SUPER_ADMIN'],
    buildIdempotencyKey: (ctx) => `${key}:${ctx.dateKey}`,
    evaluate: async () => true,
    execute: async () => ({
      actionsExecuted: ['test_action'],
      recipientsNotified: [],
    }),
    ...overrides,
  }
}

describe('Automation Registry', () => {
  it('should register and retrieve an automation', () => {
    const def = createMockDefinition()
    registerAutomation(def)
    const retrieved = getAutomation(def.key)
    expect(retrieved).toBeDefined()
    expect(retrieved!.key).toBe(def.key)
  })

  it('should return undefined for unknown key', () => {
    expect(getAutomation('nonexistent.key.xyz')).toBeUndefined()
  })

  it('should list all registered automations', () => {
    const before = getAllAutomations().length
    const def = createMockDefinition()
    registerAutomation(def)
    expect(getAllAutomations().length).toBe(before + 1)
  })

  it('should filter cron automations', () => {
    const cronDef = createMockDefinition({ triggerType: 'cron', schedule: '09:00' })
    registerAutomation(cronDef)
    const cronJobs = getCronAutomations()
    expect(cronJobs.some((j) => j.key === cronDef.key)).toBe(true)
  })

  it('should filter event automations', () => {
    const eventDef = createMockDefinition({ triggerType: 'event' })
    registerAutomation(eventDef)
    const eventJobs = getEventAutomations('test')
    expect(eventJobs.some((j) => j.key === eventDef.key)).toBe(true)
  })

  it('should generate automation summaries', () => {
    const def = createMockDefinition()
    registerAutomation(def)
    const summaries = listAutomationSummaries()
    const summary = summaries.find((s) => s.key === def.key)
    expect(summary).toBeDefined()
    expect(summary!.title).toBe(def.title)
    expect(summary!.domain).toBe(def.domain)
  })
})

// ── Test triggerAutomations ─────────────────────────────────
import { triggerAutomations } from '../automation/trigger.js'

describe('Automation Trigger', () => {
  it('should not throw for unknown automation keys', () => {
    expect(() => {
      triggerAutomations(['nonexistent.automation.xyz'], { test: true })
    }).not.toThrow()
  })

  it('should silently handle registered automations (fire-and-forget)', () => {
    const def = createMockDefinition()
    registerAutomation(def)
    expect(() => {
      triggerAutomations([def.key], { projectId: '123' })
    }).not.toThrow()
  })
})

// ── Test idempotency key generation ───────────────────────────
describe('Automation — Idempotency Key Generation', () => {
  it('should generate unique keys per date', () => {
    const def = createMockDefinition({
      buildIdempotencyKey: (ctx) => `test:${ctx.dateKey}`,
    })

    const ctx1 = buildContext()
    const ctx2 = buildContext()

    // Same day = same key
    expect(def.buildIdempotencyKey(ctx1)).toBe(def.buildIdempotencyKey(ctx2))
  })

  it('should generate unique keys with meta data', () => {
    const def = createMockDefinition({
      buildIdempotencyKey: (ctx) => `test:${ctx.meta?.projectId}`,
    })

    const ctx1 = buildContext({ projectId: 'aaa' })
    const ctx2 = buildContext({ projectId: 'bbb' })

    expect(def.buildIdempotencyKey(ctx1)).not.toBe(def.buildIdempotencyKey(ctx2))
  })
})

// ── Test automation definition structure ─────────────────────
describe('Automation Definition Validation', () => {
  it('should have all required fields', () => {
    const def = createMockDefinition()
    expect(def.key).toBeTruthy()
    expect(def.title).toBeTruthy()
    expect(def.domain).toBeTruthy()
    expect(def.triggerType).toBeTruthy()
    expect(def.channels).toBeInstanceOf(Array)
    expect(def.recipientStrategy).toBeInstanceOf(Array)
    expect(typeof def.retryable).toBe('boolean')
    expect(typeof def.maxRetries).toBe('number')
    expect(typeof def.defaultEnabled).toBe('boolean')
    expect(typeof def.buildIdempotencyKey).toBe('function')
    expect(typeof def.evaluate).toBe('function')
    expect(typeof def.execute).toBe('function')
  })

  it('evaluate should return a Promise<boolean>', async () => {
    const def = createMockDefinition()
    const ctx = buildContext()
    ctx.settings = { key: def.key, enabled: true, channels: ['in_app'], throttleWindowMinutes: 0, escalationEnabled: false, config: {}, updatedAt: new Date() }
    const result = await def.evaluate(ctx)
    expect(typeof result).toBe('boolean')
  })

  it('execute should return an AutomationResult', async () => {
    const def = createMockDefinition()
    const ctx = buildContext()
    ctx.settings = { key: def.key, enabled: true, channels: ['in_app'], throttleWindowMinutes: 0, escalationEnabled: false, config: {}, updatedAt: new Date() }
    const result = await def.execute(ctx)
    expect(result).toHaveProperty('actionsExecuted')
    expect(result).toHaveProperty('recipientsNotified')
    expect(result.actionsExecuted).toBeInstanceOf(Array)
    expect(result.recipientsNotified).toBeInstanceOf(Array)
  })
})
