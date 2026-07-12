import type { Request, Response, NextFunction } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireAdmin } from './role.js'
import User from '../models/User.js'

vi.mock('../models/User.js', () => ({
  default: {
    findById: vi.fn(),
  },
}))

function response() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> }
}

function req(overrides: Partial<Request> = {}) {
  return {
    originalUrl: '/api/admin/users',
    user: { id: 'u1', role: 'SUPER_ADMIN' },
    ...overrides,
  } as Partial<Request> as Request
}

describe('admin MFA enrollment gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets a grace deadline and allows the first privileged request after rollout', async () => {
    const user = { twoFactorEnabled: false, mfaGraceUntil: null, save: vi.fn() }
    vi.mocked(User.findById).mockReturnValue({ select: () => Promise.resolve(user) } as any)
    const res = response()
    const next = vi.fn() as NextFunction

    await requireAdmin(req(), res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(user.mfaGraceUntil).toBeInstanceOf(Date)
    expect(user.save).toHaveBeenCalledOnce()
  })

  it('blocks privileged admins after the setup grace expires', async () => {
    vi.mocked(User.findById).mockReturnValue({
      select: () => Promise.resolve({ twoFactorEnabled: false, mfaGraceUntil: new Date(Date.now() - 1000), save: vi.fn() }),
    } as any)
    const res = response()
    const next = vi.fn() as NextFunction

    await requireAdmin(req(), res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'MFA_SETUP_REQUIRED' }))
  })

  it('always allows enrollment endpoints so expired users can configure MFA', async () => {
    const res = response()
    const next = vi.fn() as NextFunction

    await requireAdmin(req({ originalUrl: '/api/admin/2fa/setup' }), res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(User.findById).not.toHaveBeenCalled()
  })
})
